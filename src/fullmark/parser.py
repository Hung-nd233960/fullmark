"""Markdown -> models. Structure only; semantic checks live in validate.py."""

import hashlib
import re
from dataclasses import dataclass, field
from pathlib import Path

import yaml
from markdown_it.token import Token
from pydantic import ValidationError

from .mdutil import make_md
from .models import (
    QUESTION_TYPES,
    Choice,
    Findings,
    FrontMatter,
    Question,
    Quiz,
    Section,
    format_pydantic_errors,
    parse_duration,
)

_ATTR_BLOCK_RE = re.compile(r"^(.*?)\s*\{([^{}]*=[^{}]*)\}\s*$", re.DOTALL)
_ATTR_TOKEN_RE = re.compile(r'\s*(\w+)=("[^"]*"|\S+)')
_CHECK_RE = re.compile(r"^(\s*(?:[-*+]|\d+[.)])\s+)\[( |x|X)\](?:\s+|$)")
_ITEM_MARK_RE = re.compile(r"^(\s*(?:[-*+]|\d+[.)])\s+)")
_CALLOUT_RE = re.compile(r"^\s*>\s?\[!(\w+)\]\s*$", re.IGNORECASE)
_ID_RE = re.compile(r"^[A-Za-z][\w-]*$")
# A follow-up marker at the very end of a choice: {input} or {input="Prompt text"}.
_INPUT_RE = re.compile(r'\s*\{input(?:="([^"{}]*)")?\}\s*$')
_INPUT_LOOSE_RE = re.compile(r"\s*\{\s*input\b[^{}]*\}?\s*$")
DEFAULT_INPUT_PROMPT = "Please specify"
INPUT_HINT = 'write {input} or {input="Prompt text"}'

QUESTION_ATTRS = {"type", "points", "id", "tags", "shuffle", "case", "graded"}
SECTION_ATTRS = {"time", "pick"}


@dataclass
class _Draft:
    """Collects the blocks of one question while walking the document."""

    line: int
    section: int
    title: str
    attrs: dict
    prompt: list[str] = field(default_factory=list)
    choices: list[Choice] = field(default_factory=list)
    has_choice_list: bool = False
    items: list[Choice] = field(default_factory=list)
    has_item_list: bool = False
    hint: str = ""
    explanation: str = ""
    answer_text: str | None = None
    answer_line: int = 0
    prompt_line: int = 0


def split_attrs(
    text: str, allowed: set[str], findings: Findings, line: int
) -> tuple[str, dict]:
    """Split 'Title {a=b c="d e"}' into (title, {a: b, c: 'd e'})."""
    m = _ATTR_BLOCK_RE.match(text)
    if not m:
        return text.strip(), {}
    title, body = m.group(1).strip(), m.group(2)
    attrs: dict[str, str] = {}
    pos = 0
    while pos < len(body) and body[pos:].strip():
        t = _ATTR_TOKEN_RE.match(body, pos)
        if not t:
            findings.error(
                line, f"cannot parse attribute list '{{{body}}}'; use key=value pairs"
            )
            return title, {}
        key, val = t.group(1), t.group(2).strip('"')
        if key not in allowed:
            findings.error(
                line,
                f"unknown attribute '{key}' (allowed: {', '.join(sorted(allowed))})",
            )
        attrs[key] = val
        pos = t.end()
    return title, attrs


def _blocks(tokens: list[Token]):
    """Yield (token, inner_tokens) for each top-level block."""
    i = 0
    while i < len(tokens):
        t = tokens[i]
        if t.level != 0:
            i += 1
            continue
        if t.nesting == 1:
            j = i + 1
            while not (tokens[j].level == 0 and tokens[j].nesting == -1):
                j += 1
            yield t, tokens[i + 1 : j]
            i = j + 1
        elif t.nesting == 0:
            yield t, []
            i += 1
        else:
            i += 1


def _src(lines: list[str], tok: Token) -> str:
    s, e = tok.map
    return "\n".join(lines[s:e]).rstrip()


def split_input(text: str, line: int, findings: Findings) -> tuple[str, str | None]:
    """Split a trailing {input} / {input="Prompt"} off `text`: (text, prompt or None)."""
    m = _INPUT_RE.search(text)
    if m:
        prompt = m.group(1)
        if prompt is None:
            prompt = DEFAULT_INPUT_PROMPT
        elif not prompt.strip():
            findings.error(
                line,
                f'empty prompt in {{input=""}}; give the prompt text, or {INPUT_HINT}',
            )
            prompt = DEFAULT_INPUT_PROMPT
        return text[: m.start()].rstrip(), prompt.strip()
    m = _INPUT_LOOSE_RE.search(text)
    if m:
        findings.error(
            line, f"cannot parse '{m.group().strip()}'; {INPUT_HINT} (double quotes)"
        )
        return text[: m.start()].rstrip(), None
    return text, None


def _choices_from_list(
    lines: list[str], inner: list[Token], findings: Findings
) -> list[Choice] | None:
    """Return choices if this list is a task list, else None."""
    items = [t for t in inner if t.type == "list_item_open" and t.level == 1]
    if not items:
        return None
    first = lines[items[0].map[0]]
    if not _CHECK_RE.match(first):
        return None
    out = []
    for it in items:
        s, e = it.map
        raw = lines[s:e]
        m = _CHECK_RE.match(raw[0])
        if not m:
            findings.error(
                s + 1, "every item in a choice list must start with [ ] or [x]"
            )
            continue
        width = len(m.group(1))
        body = [raw[0][m.end() :]] + [
            ln[width:] if ln[:width].strip() == "" else ln.lstrip() for ln in raw[1:]
        ]
        md, prompt = split_input("\n".join(body).strip("\n").rstrip(), s + 1, findings)
        out.append(Choice(md=md, correct=m.group(2) in "xX", line=s + 1, input=prompt))
    return out


def _plain_items(
    lines: list[str], inner: list[Token], findings: Findings
) -> list[Choice]:
    """The items of an ordering or matching list (no [ ] marks)."""
    out = []
    for it in (t for t in inner if t.type == "list_item_open" and t.level == 1):
        s, e = it.map
        raw = lines[s:e]
        m = _ITEM_MARK_RE.match(raw[0])
        width = len(m.group(1)) if m else 0
        body = [raw[0][width:]] + [
            ln[width:] if ln[:width].strip() == "" else ln.lstrip() for ln in raw[1:]
        ]
        md, prompt = split_input(
            ("\n").join(body).strip("\n").rstrip(), s + 1, findings
        )
        if prompt is not None:
            findings.error(
                s + 1, "{input} only works on the choices of a single or multi question"
            )
        out.append(Choice(md=md, correct=False, line=s + 1))
    return out


def _callout(lines: list[str], tok: Token) -> tuple[str, str] | None:
    s, e = tok.map
    m = _CALLOUT_RE.match(lines[s])
    if not m:
        return None
    body = [re.sub(r"^\s*>\s?", "", ln) for ln in lines[s + 1 : e]]
    return m.group(1).lower(), "\n".join(body).strip()


def parse_text(
    text: str, file: str, findings: Findings, stem: str = "quiz"
) -> Quiz | None:
    """Parse quiz source text. Returns None when front matter is unusable."""
    md = make_md()
    tokens = md.parse(text)
    lines = text.split("\n")

    # ---- front matter
    fm_tok = next((t for t in tokens if t.type == "front_matter"), None)
    if fm_tok is None:
        findings.error(
            1, "missing YAML front matter; start the file with --- and a title"
        )
        return None
    fm_line = fm_tok.map[0] + 1
    try:
        raw = yaml.safe_load(fm_tok.content) or {}
    except yaml.YAMLError as exc:
        mark = getattr(exc, "problem_mark", None)
        ln = fm_line + 1 + (mark.line if mark else 0)
        hint = (
            " (quote values that contain ': ')" if "mapping values" in str(exc) else ""
        )
        findings.error(
            ln, f"front matter is not valid YAML: {getattr(exc, 'problem', exc)}{hint}"
        )
        return None
    if not isinstance(raw, dict):
        findings.error(fm_line, "front matter must be a YAML mapping")
        return None
    try:
        meta = FrontMatter.model_validate(raw)
    except ValidationError as exc:
        for key, msg in format_pydantic_errors(exc):
            findings.error(_key_line(fm_tok.content, key.split(".")[0], fm_line), msg)
        return None

    # ---- walk blocks
    sections: list[Section] = [Section(title="", line=1)]
    explicit_sections = False
    drafts: list[_Draft] = []
    cur: _Draft | None = None
    preamble: list[str] = []
    intro: dict[int, list[str]] = {0: []}

    for tok, inner in _blocks(tokens):
        if tok.type == "front_matter":
            continue
        line = tok.map[0] + 1 if tok.map else 0
        if tok.type == "heading_open":
            level = int(tok.tag[1])
            heading = inner[0].content if inner else ""
            if level == 1:
                title, attrs = split_attrs(heading, SECTION_ATTRS, findings, line)
                sec = Section(title=title, line=line)
                if "time" in attrs:
                    try:
                        parse_duration(attrs["time"])
                        sec.time = attrs["time"]
                    except ValueError as exc:
                        findings.error(line, f"section {title!r}: {exc}")
                if "pick" in attrs:
                    if attrs["pick"].isdigit() and int(attrs["pick"]) >= 1:
                        sec.pick = int(attrs["pick"])
                    else:
                        findings.error(
                            line,
                            f"section {title!r}: pick must be a whole number, 1 or more",
                        )
                if not explicit_sections:
                    sections = []
                    explicit_sections = True
                    intro = {}
                sections.append(sec)
                intro[len(sections) - 1] = []
                cur = None
                continue
            if level == 2:
                title, attrs = split_attrs(heading, QUESTION_ATTRS, findings, line)
                if _INPUT_LOOSE_RE.search(title):
                    findings.error(
                        line,
                        "{input} belongs at the end of a choice (- [ ] item), not on the question heading",
                    )
                cur = _Draft(
                    line=line, section=len(sections) - 1, title=title, attrs=attrs
                )
                drafts.append(cur)
                continue
            findings.error(
                line,
                f"heading level {level} is not allowed; use ## for questions and # for sections",
            )
            seg = _src(lines, tok)
            (
                cur.prompt
                if cur
                else (intro[len(sections) - 1] if explicit_sections else preamble)
            ).append(seg)
            continue

        if cur is None:
            target = intro[len(sections) - 1] if explicit_sections else preamble
            target.append(_src(lines, tok))
            continue

        # ---- inside a question
        if tok.type == "fence" and tok.info.strip().split(" ")[0] == "answer":
            if cur.answer_text is not None:
                findings.error(line, "more than one ```answer block in this question")
            else:
                cur.answer_text = tok.content
                cur.answer_line = line + 1
            continue
        if tok.type in ("bullet_list_open", "ordered_list_open"):
            choices = _choices_from_list(lines, inner, findings)
            if choices is not None:
                if cur.has_choice_list:
                    findings.error(line, "more than one choice list in this question")
                cur.has_choice_list = True
                cur.choices.extend(choices)
                continue
        if (
            tok.type in ("bullet_list_open", "ordered_list_open")
            and cur.attrs.get("type") in ("ordering", "matching")
            and not cur.has_choice_list
        ):
            if cur.has_item_list:
                findings.error(line, "more than one item list in this question")
            cur.has_item_list = True
            cur.items.extend(_plain_items(lines, inner, findings))
            continue
        if tok.type == "blockquote_open":
            c = _callout(lines, tok)
            if c and c[0] in ("hint", "explanation"):
                if c[0] == "hint":
                    cur.hint = c[1]
                else:
                    cur.explanation = c[1]
                continue
        if not cur.prompt and not cur.prompt_line:
            cur.prompt_line = line
        cur.prompt.append(_src(lines, tok))

    # ---- intro text goes to sections
    for idx, parts in intro.items():
        if idx < len(sections):
            sections[idx].intro_md = "\n\n".join(p for p in parts if p)

    questions = [
        _finish_question(d, n, findings, meta) for n, d in enumerate(drafts, 1)
    ]
    quiz_id = meta.id or stem
    return Quiz(
        meta=meta,
        id=quiz_id,
        source_file=file,
        source_hash=source_hash(text),
        preamble_md="\n\n".join(preamble),
        sections=sections,
        questions=questions,
    )


def _key_line(content: str, key: str, base: int) -> int:
    for n, ln in enumerate(content.split("\n")):
        if re.match(rf"^{re.escape(key)}\s*:", ln):
            return base + 1 + n
    return base


def _finish_question(
    d: _Draft, index: int, findings: Findings, meta: FrontMatter
) -> Question:
    a = d.attrs
    qid = a.get("id", f"q{index}")
    if not _ID_RE.match(qid):
        findings.error(
            d.line,
            f"bad id {qid!r}; start with a letter, then letters, digits, - or _",
            qid,
        )

    survey = meta.mode == "survey"
    graded = True
    if "graded" in a:
        if survey:
            findings.error(
                d.line,
                "survey mode makes every question ungraded; remove graded=",
                qid,
            )
        elif a["graded"] in ("true", "false"):
            graded = a["graded"] == "true"
        else:
            findings.error(d.line, "graded must be true or false", qid)
    if survey:
        graded = False

    checked = sum(c.correct for c in d.choices)
    qtype = a.get("type")
    if qtype is None:
        if d.has_choice_list:
            qtype = "single" if checked == 1 else "multi" if checked >= 2 else "single"
            if checked == 0 and graded:
                findings.error(
                    d.line, "no correct choice: mark the right answer with [x]", qid
                )
        else:
            qtype = "short"
            findings.error(
                d.line,
                "cannot infer the question type; add {type=...} to the heading",
                qid,
            )
    elif qtype not in QUESTION_TYPES:
        findings.error(
            d.line,
            f"unknown type {qtype!r} (allowed: {', '.join(QUESTION_TYPES)})",
            qid,
        )
        qtype = "short"

    points = 1.0
    if "points" in a:
        try:
            points = float(a["points"])
            if points <= 0:
                raise ValueError
        except ValueError:
            findings.error(
                d.line,
                f"points must be a number greater than 0, got {a['points']!r}",
                qid,
            )
            points = 1.0
    if not graded or qtype == "scale":
        if "points" in a:
            findings.warn(
                d.line, "ungraded questions have no points; ignoring points=", qid
            )
        points = 0.0

    shuffle = None
    if "shuffle" in a:
        if a["shuffle"] in ("true", "false"):
            shuffle = a["shuffle"] == "true"
        else:
            findings.error(d.line, "shuffle must be true or false", qid)
    case = a.get("case", "insensitive")
    if case not in ("sensitive", "insensitive"):
        findings.error(d.line, "case must be sensitive or insensitive", qid)
        case = "insensitive"

    answer_raw = None
    if d.answer_text is not None:
        try:
            loaded = yaml.safe_load(d.answer_text)
        except yaml.YAMLError as exc:
            mark = getattr(exc, "problem_mark", None)
            ln = d.answer_line + (mark.line if mark else 0)
            findings.error(
                ln,
                f"answer block is not valid YAML: {getattr(exc, 'problem', exc)}",
                qid,
            )
            loaded = None
        else:
            if loaded is None:
                loaded = {}
            if not isinstance(loaded, dict):
                findings.error(
                    d.answer_line,
                    "answer block must be a YAML mapping (key: value)",
                    qid,
                )
                loaded = None
        answer_raw = loaded

    return Question(
        id=qid,
        index=index,
        line=d.line,
        section=d.section,
        type=qtype,
        title_md=d.title,
        prompt_md="\n\n".join(p for p in d.prompt if p),
        points=points,
        tags=[t.strip() for t in a.get("tags", "").split(",") if t.strip()],
        shuffle=shuffle,
        case=case,
        graded=graded,
        choices=d.choices,
        items=d.items,
        hint_md=d.hint,
        explanation_md=d.explanation,
        answer_raw=answer_raw,
        answer_line=d.answer_line,
    )


def source_hash(text: str) -> str:
    """The version id of a quiz: SHA-256 of the normalised source, 16 hex characters."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def read_source(path: Path) -> str:
    return (
        path.read_text(encoding="utf-8-sig").replace("\r\n", "\n").replace("\r", "\n")
    )
