"""Semantic checks beyond the structural parse, plus `load_quiz` (parse + validate)."""

import re
from pathlib import Path

from pydantic import ValidationError
from pygments.lexers import get_lexer_by_name
from pygments.util import ClassNotFound

from .blanks import BLANK_RE, find_blanks
from .lint import lint
from .mdutil import math_spans, strip_code
from .models import (
    AUTO_TYPES,
    SPEC_MODELS,
    Findings,
    Quiz,
    format_pydantic_errors,
)
from .parser import parse_text, read_source

IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"}
AUDIO_EXTS = {".mp3", ".ogg", ".wav", ".m4a"}
VIDEO_EXTS = {".mp4", ".webm", ".mov", ".mkv", ".avi", ".m4v"}
MEDIA_RE = re.compile(r"!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+\"[^\"]*\")?\s*\)")
FENCE_LANG_RE = re.compile(r"^(?:`{3,}|~{3,})\s*([\w+#.-]+)", re.MULTILINE)
_UNSUPPORTED_RE = re.compile(r"\(\?<[=!]|\(\?P<|\(\?<\w|\(\?P=|\(\?[aiLmsux]+[:)]")
_NO_LEXER = {"answer", "text", "txt", "plain", "plaintext"}
UNGRADED_TYPES = ("single", "multi", "short", "fields", "essay", "ordering", "scale")


def media_refs(md: str) -> list[tuple[str, str]]:
    """(alt, path) for every image/audio reference outside code."""
    return [(m.group(1), m.group(2)) for m in MEDIA_RE.finditer(strip_code(md))]


def check_regex(pattern: str) -> str | None:
    """Return an error message when `pattern` is invalid or not portable to JavaScript."""
    try:
        re.compile(pattern)
    except re.error as exc:
        return f"invalid regex {pattern!r}: {exc}"
    if _UNSUPPORTED_RE.search(pattern):
        return f"regex {pattern!r} uses lookbehind, named groups or inline flags, which JavaScript lacks"
    return None


def _line_of(lines: list[str], needle: str, start: int) -> int:
    """1-based line of the first occurrence of `needle` at or after 1-based `start`."""
    for n in range(max(start - 1, 0), len(lines)):
        if needle in lines[n]:
            return n + 1
    return start


def validate(
    quiz: Quiz, source_lines: list[str], base_dir: Path, findings: Findings
) -> None:
    seen: dict[str, int] = {}
    survey = quiz.meta.mode == "survey"
    if quiz.meta.review and not survey:
        findings.error(
            _line_of(source_lines, "review:", 1),
            "review: true is only for the form `quiz review` makes, which is a survey",
        )
    if survey:
        _check_survey_front_matter(quiz, source_lines, findings)
    if not quiz.questions:
        findings.error(1, "the quiz has no questions; start each one with a ## heading")

    for q in quiz.questions:
        lbl = q.label
        if q.id in seen:
            findings.error(
                q.line, f"duplicate question id (first used on line {seen[q.id]})", q.id
            )
        seen[q.id] = q.line

        has_block = q.answer_line > 0
        ung = q.ungraded
        if ung and q.type not in UNGRADED_TYPES:
            what = "survey mode" if survey else "`graded=false`"
            findings.error(
                q.line,
                f"{what} is not supported for {q.type}; use single, short or fields",
                lbl,
            )
        if q.type == "scale" and q.graded and "graded=true" in source_lines[q.line - 1]:
            findings.error(q.line, "scale questions are always ungraded", lbl)
        ans_lines = source_lines[q.answer_line - 1 :] if has_block else []

        def key_line(key: str, q=q, ans_lines=ans_lines) -> int:
            top = key.split(".")[0]
            for n, ln in enumerate(ans_lines):
                if ln.startswith("```") and n > 0:
                    break
                if re.match(rf"\s*(?:-\s+)?{re.escape(top)}\s*:", ln):
                    return q.answer_line + n
            return q.answer_line or q.line

        # ---- choices
        if q.type in ("single", "multi"):
            correct = sum(c.correct for c in q.choices)
            if not q.choices:
                findings.error(
                    q.line, f"{q.type} needs a choice list (- [ ] / - [x] items)", lbl
                )
            else:
                if len(q.choices) < 2:
                    findings.error(q.line, "needs at least two choices", lbl)
                if ung:
                    who = "survey" if survey else "ungraded"
                    for c in q.choices:
                        if c.correct:
                            findings.error(
                                c.line,
                                f"{who} questions have no correct choice; remove the [x]",
                                lbl,
                            )
                elif q.type == "single" and correct != 1:
                    findings.error(
                        q.line,
                        f"exactly one choice must be marked [x], found {correct}",
                        lbl,
                    )
                elif q.type == "multi" and correct < 1:
                    findings.error(
                        q.line, "at least one choice must be marked [x]", lbl
                    )
            if has_block:
                findings.error(
                    q.answer_line - 1, "choice questions take no ```answer block", lbl
                )
        elif q.choices:
            findings.error(
                q.line,
                f"a choice list only belongs to single/multi, but the type is {q.type}",
                lbl,
            )
        if q.type not in ("single", "multi"):
            for c in q.choices:
                if c.input is not None:
                    findings.error(
                        c.line,
                        f"{{input}} only works on single/multi choices, but the type is {q.type}",
                        lbl,
                    )

        # ---- ordering and matching lists
        if q.type == "ordering":
            if len(q.items) < 2:
                findings.error(
                    q.line,
                    "ordering needs a list of at least two items, in the correct order",
                    lbl,
                )
            seen_items: dict[str, int] = {}
            for it in q.items:
                norm = re.sub(r"\s+", " ", it.md).strip().lower()
                if norm in seen_items:
                    findings.error(
                        it.line,
                        f"duplicate ordering item (first on line {seen_items[norm]})",
                        lbl,
                    )
                seen_items.setdefault(norm, it.line)
        elif q.type == "matching":
            _check_matching(q, findings)
        if q.type in ("ordering", "matching") and has_block:
            findings.error(
                q.answer_line - 1, f"{q.type} questions take no ```answer block", lbl
            )

        # ---- answer blocks
        if q.type == "blanks":
            if has_block:
                findings.error(
                    q.answer_line - 1,
                    "blanks questions take no ```answer block; write [[answers]] inline",
                    lbl,
                )
        elif q.type in ("ordering", "matching"):
            pass
        elif q.type in SPEC_MODELS:
            required = q.type not in ("essay", "scale") and not (
                ung and q.type == "short"
            )
            if ung and q.type == "short":
                if has_block:
                    findings.error(
                        q.answer_line - 1,
                        "an ungraded short question takes no ```answer block",
                        lbl,
                    )
            elif not has_block:
                if required:
                    findings.error(
                        q.line, f"missing ```answer block for a {q.type} question", lbl
                    )
            elif q.answer_raw is not None:
                try:
                    q.spec = SPEC_MODELS[q.type].model_validate(q.answer_raw)
                except ValidationError as exc:
                    for key, msg in format_pydantic_errors(exc):
                        findings.error(key_line(key), msg, lbl)
            if not has_block and q.type in ("essay", "scale"):
                q.spec = SPEC_MODELS[q.type]()
            if ung and q.spec is not None:
                _check_ungraded_spec(q, key_line, findings)

        # ---- regexes
        spec = q.spec
        patterns: list[tuple[str, str]] = []
        if q.type == "short" and spec is not None:
            patterns = [("patterns", p) for p in spec.patterns]
        if q.type == "fields" and spec is not None:
            patterns = [("patterns", p) for f in spec.fields for p in f.patterns]
        for key, pat in patterns:
            msg = check_regex(pat)
            if msg:
                findings.error(key_line(key), msg, lbl)

        # ---- blanks
        scan = f"{q.title_md} \n{q.prompt_md}"
        if q.type == "blanks":
            try:
                blanks = find_blanks(scan)
            except ValueError as exc:
                findings.error(_line_of(source_lines, "[[", q.line), str(exc), lbl)
                blanks = []
            else:
                if not blanks:
                    findings.error(
                        q.line, "a blanks question needs at least one [[answer]]", lbl
                    )
                q.blanks = [b.spec() for b in blanks]
            for frag in math_spans(scan):
                if BLANK_RE.search(frag):
                    findings.error(
                        _line_of(source_lines, "[[", q.line),
                        "blanks are not allowed inside math ($...$)",
                        lbl,
                    )
        else:
            outside = strip_code(
                " \n".join([scan, *(c.md for c in q.choices), *(c.md for c in q.items)])
            )
            if BLANK_RE.search(outside):
                findings.error(
                    _line_of(source_lines, "[[", q.line),
                    "[[...]] blanks only work in type=blanks questions",
                    lbl,
                )

        # ---- media and code languages
        texts = [
            q.title_md,
            q.prompt_md,
            q.hint_md,
            q.explanation_md,
            *(c.md for c in q.choices),
            *(c.md for c in q.items),
        ]
        if q.type == "fields" and spec is not None:
            texts += [f.label for f in spec.fields]
        _check_media(texts, base_dir, source_lines, q, findings)
        _check_languages(texts, source_lines, q, findings)
        if q.type == "code" and spec is not None:
            _lexer_warning(spec.language, key_line("language"), lbl, findings)

        # ---- warnings
        if q.type in AUTO_TYPES and not ung and not q.explanation_md:
            findings.warn(q.line, "no explanation", lbl)
        if (
            q.type in ("essay", "code")
            and not ung
            and spec is not None
            and not spec.rubric
        ):
            findings.warn(q.line, f"{q.type} question without a rubric", lbl)
        if q.type == "scale" and spec is not None and not spec.labels:
            findings.warn(
                q.line, "scale without labels; label at least the two ends", lbl
            )
        if ung and q.type == "single" and 2 <= len(q.choices) < 3:
            findings.warn(
                q.line,
                "ungraded single question with fewer than three choices; "
                "add an 'Other' choice or use short",
                lbl,
            )

    _check_bank(quiz, findings)
    lint(quiz, findings)
    for sec in quiz.sections:
        _check_media(
            [sec.intro_md], base_dir, source_lines, None, findings, line=sec.line
        )
    _check_media(
        [quiz.preamble_md, quiz.meta.description],
        base_dir,
        source_lines,
        None,
        findings,
        line=1,
    )


def _check_survey_front_matter(
    quiz: Quiz, source_lines: list[str], findings: Findings
) -> None:
    """In survey mode nothing is graded, so the grading keys are errors."""
    meta = quiz.meta

    def fm_line(key: str) -> int:
        return _line_of(source_lines, f"{key}:", 1)

    bad = []
    if meta.pass_mark is not None:
        bad.append(("pass_mark", "pass_mark"))
    if meta.pick is not None:
        bad.append(("pick", "pick"))
    if meta.feedback == "instant":
        bad.append(("feedback", "feedback: instant"))
    if "multi_scoring" in meta.model_fields_set:
        bad.append(("multi_scoring", "multi_scoring"))
    for key, name in bad:
        findings.error(fm_line(key), f"{name} is not allowed in survey mode")
    for sec in quiz.sections:
        if sec.pick:
            findings.error(sec.line, "pick is not allowed in survey mode")


def _check_ungraded_spec(q, key_line, findings: Findings) -> None:
    lbl = q.label
    if q.type == "fields":
        for f in q.spec.fields:
            if f.kind != "none":
                findings.error(
                    key_line("fields"),
                    f"field {f.label!r}: an ungraded fields question takes no "
                    "value/accept/patterns",
                    lbl,
                )
    elif q.type == "essay" and q.spec.rubric:
        findings.error(
            key_line("rubric"),
            "an ungraded essay takes no rubric (a rubric implies grading)",
            lbl,
        )


def _check_matching(q, findings: Findings) -> None:
    """Split 'left :: right' items into q.match; report malformed lists."""
    lbl = q.label
    lefts: list[str] = []
    rights: list[str] = []
    answer: list[int] = []
    seen: dict[str, int] = {}
    bad = False
    for it in q.items:
        left, sep, right = it.md.partition("::")
        left, right = left.strip(), right.strip()
        if not sep:
            findings.error(it.line, "matching item needs '::' (left :: right)", lbl)
            bad = True
            continue
        if not right:
            findings.error(it.line, "matching item has nothing after '::'", lbl)
            bad = True
            continue
        norm = re.sub(r"\s+", " ", right).lower()
        if norm in seen:
            findings.error(
                it.line,
                f"duplicate right-hand item (first on line {seen[norm]}); each right side must be unique",
                lbl,
            )
            bad = True
            continue
        seen[norm] = it.line
        if left:
            lefts.append(left)
            answer.append(len(rights))
        rights.append(right)
    if len(lefts) < 2 and not bad:
        findings.error(q.line, "matching needs at least two 'left :: right' pairs", lbl)
        bad = True
    if not bad:
        q.match = {"lefts": lefts, "rights": rights, "answer": answer}


def _check_bank(quiz: Quiz, findings: Findings) -> None:
    if quiz.meta.pick is not None and any(s.pick for s in quiz.sections):
        findings.error(
            1,
            "'pick' in the front matter and '{pick=N}' on a section cannot be combined; "
            "use one or the other",
        )
        return
    if quiz.meta.pick is not None and quiz.meta.pick > len(quiz.questions):
        findings.error(
            1,
            f"pick: {quiz.meta.pick} is more than the {len(quiz.questions)} questions in the quiz",
        )
    for i, sec in enumerate(quiz.sections):
        n = sum(1 for q in quiz.questions if q.section == i)
        if sec.pick and sec.pick > n:
            findings.error(
                sec.line,
                f"section {sec.title!r}: pick={sec.pick} is more than its {n} questions",
            )


def _check_media(
    texts, base_dir: Path, source_lines, q, findings: Findings, line: int | None = None
) -> None:
    lbl = q.label if q else None
    start = q.line if q else (line or 1)
    for text in texts:
        for alt, ref in media_refs(text):
            ln = _line_of(source_lines, ref, start)
            ext = Path(ref.split("?")[0]).suffix.lower()
            if re.match(r"^[a-z][a-z0-9+.-]*:", ref, re.IGNORECASE) and not re.match(
                r"^[a-zA-Z]:[\\/]", ref
            ):
                findings.error(
                    ln, f"remote or absolute URL {ref!r}; use a local file path", lbl
                )
                continue
            if ext in VIDEO_EXTS:
                findings.error(
                    ln,
                    f"video is not supported in v1 ({ref!r}); use an image or audio file",
                    lbl,
                )
                continue
            if ext not in IMAGE_EXTS | AUDIO_EXTS:
                findings.error(
                    ln, f"unsupported media type {ext or '(none)'!r} for {ref!r}", lbl
                )
                continue
            if not (base_dir / ref).is_file():
                findings.error(ln, f"file not found: {ref}", lbl)
            if not alt.strip():
                findings.warn(ln, f"empty alt text for {ref!r}", lbl)


def _lexer_warning(lang: str, line: int, lbl: str | None, findings: Findings) -> None:
    if lang.lower() in _NO_LEXER:
        return
    try:
        get_lexer_by_name(lang)
    except ClassNotFound:
        findings.warn(
            line,
            f"unknown code language {lang!r}; it will be shown without highlighting",
            lbl,
        )


def _check_languages(texts, source_lines, q, findings: Findings) -> None:
    seen = set()
    for text in texts:
        for m in FENCE_LANG_RE.finditer(text):
            lang = m.group(1)
            if lang not in seen:
                seen.add(lang)
                _lexer_warning(
                    lang,
                    _line_of(source_lines, "```" + lang, q.line),
                    q.label,
                    findings,
                )


def load_quiz(path: Path) -> tuple[Quiz | None, Findings, str]:
    """Parse and validate a quiz file. Returns (quiz or None, findings, source text)."""
    findings = Findings(path.name)
    text = read_source(path)
    quiz = parse_text(text, path.name, findings, stem=path.stem)
    if quiz is not None:
        validate(quiz, text.split("\n"), path.parent, findings)
    return quiz, findings, text


def load_quiz_text(
    text: str, name: str, stem: str, base_dir: Path
) -> tuple[Quiz | None, Findings]:
    """Parse and validate quiz source that is not a file (a form made in memory)."""
    findings = Findings(name)
    quiz = parse_text(text, name, findings, stem=stem)
    if quiz is not None:
        validate(quiz, text.split("\n"), base_dir, findings)
    return quiz, findings
