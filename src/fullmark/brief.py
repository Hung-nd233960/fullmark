"""`quiz brief`: the question list, `brief.yaml` and the survey behind `--web`.

`brief_questions.yaml` defines every question once. The flags of `quiz brief`, the
survey for `--web` and the fields of `brief.yaml` are all built from it; this module
holds the shared logic: parsing a flag value, filling defaults, finding the missing
human-only values, writing the survey Markdown and reading a survey's results. The
idea (and the shape of the file) comes from presentation-kit's `deck new`.
"""

import functools
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal

import yaml
from pydantic import BaseModel, ConfigDict, Field

from .mdutil import write_markdownlint_config
from .models import Finding, Findings, Quiz

QUESTIONS_PATH = Path(__file__).with_name("brief_questions.yaml")
SURVEY_ID = "quiz-brief"
SECTIONS = {
    "quiz": "The quiz",
    "material": "The material",
}
EXIT_NEEDS_INPUT = 3
INTRO = (
    "Questions marked Required have no safe default. Skip any other question and it "
    "takes the default shown. When you press Finish, the answers go back to the "
    "terminal that opened this page; you can close the tab afterwards."
)
CONTENT_README = """# content/

Put everything the quiz is built from here. Subfolders are fine.

- Lecture slides: PDF or PowerPoint files.
- A textbook chapter: a PDF.
- Notes: Markdown, text, Word or PDF files.
- Past exams: PDF, Word or images. The quiz mirrors their structure.
- A lab manual: a PDF or Word file.

Material that lives somewhere else (a link, a Zotero collection, a shared folder)
can be named in `brief.yaml` under `content.elsewhere`.

`quiz check` compares `brief.yaml` with this folder. This README is ignored.
"""


class ContentBrief(BaseModel):
    """What the quiz is built from; `quiz check` compares it with `content/`."""

    model_config = ConfigDict(extra="forbid")

    kinds: list[str] = Field(default_factory=list)
    kinds_other: str = ""
    elsewhere: str = ""


class Brief(BaseModel):
    model_config = ConfigDict(extra="forbid")

    purpose: Literal["self-study", "exam-prep", "classmates", "survey"] = "self-study"
    scope: str = ""
    content: ContentBrief = Field(default_factory=ContentBrief)
    count: int = 20
    minutes: int | float = 0
    mix: list[str] = Field(default_factory=lambda: ["recall", "understanding"])
    difficulty: Literal["warm-up", "like-the-exam", "harder"] = "like-the-exam"
    mode: Literal["each-question", "at-the-end", "timed-exam"] = "at-the-end"
    weak_topics: bool = False
    # the topics to stress, filled from the results files in the folder (quiz stats)
    focus_tags: list[str] = Field(default_factory=list)
    language: Literal["en", "vi"] = "en"
    request: str = ""
    # who decided each value: user (flag or form), default, or agent
    decided_by: dict[str, Literal["user", "default", "agent"]] = Field(
        default_factory=dict
    )


def load_brief(folder: Path) -> Brief | None:
    p = Path(folder) / "brief.yaml"
    if not p.exists():
        return None
    return Brief.model_validate(yaml.safe_load(p.read_text(encoding="utf-8")) or {})


def write_brief(folder: Path, brief: Brief) -> Path:
    path = Path(folder) / "brief.yaml"
    text = yaml.dump(
        brief.model_dump(), sort_keys=False, allow_unicode=True, default_flow_style=None
    )
    path.write_text(text, encoding="utf-8", newline="\n")
    return path


# ---------------------------------------------------------------- questions


class Choice(BaseModel):
    model_config = ConfigDict(extra="forbid")

    value: str
    label: str
    hint: str = ""


class Followup(BaseModel):
    """A text box that goes with one choice of a multi question."""

    model_config = ConfigDict(extra="forbid")

    value: str
    prompt: str
    flag: str
    field: str

    @property
    def id(self) -> str:
        return self.field.split(".")[-1]

    @property
    def dest(self) -> str:
        return self.flag.lstrip("-").replace("-", "_")


class Question(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    section: Literal["quiz", "material"]
    type: Literal["choice", "multi", "number", "text"]
    label: str
    help: str = ""
    flag: str
    field: str
    default: Any = None
    delegable: bool
    choices: list[Choice] = Field(default_factory=list)
    min: float | None = None
    multiline: bool = False
    to: Literal["bool"] | None = None
    dynamic: str | None = None
    followup: Followup | None = None

    @property
    def dest(self) -> str:
        return self.flag.lstrip("-").replace("-", "_")

    @property
    def values(self) -> list[str]:
        return [c.value for c in self.choices]


@functools.cache
def load_questions() -> tuple[Question, ...]:
    raw = yaml.safe_load(QUESTIONS_PATH.read_text(encoding="utf-8"))
    return tuple(Question.model_validate(r) for r in raw)


def parse_value(q: Question, raw: str) -> Any:
    """Turn the text of a flag into the question's value. ValueError says what is wrong."""
    text = raw.strip()
    if q.type == "choice":
        if text not in q.values:
            raise ValueError(f"{q.flag}: '{raw}' is not one of {', '.join(q.values)}")
        return text
    if q.type == "multi":
        items = list(dict.fromkeys(t.strip() for t in text.split(",") if t.strip()))
        if text.lower() == "none":
            return []
        bad = [i for i in items if i not in q.values]
        if bad or not items:
            raise ValueError(
                f"{q.flag}: {', '.join(bad) if bad else 'nothing'} is not a choice;"
                f" give a comma list of {', '.join(q.values)}, or 'none'"
            )
        return items
    if q.type == "number":
        try:
            n = float(text)
        except ValueError:
            raise ValueError(f"{q.flag}: '{raw}' is not a number") from None
        if q.min is not None and n < q.min:
            raise ValueError(f"{q.flag}: {n:g} is below the minimum {q.min:g}")
        return int(n) if n == int(n) else n
    if not text and not q.delegable:
        raise ValueError(f"{q.flag}: empty; say what it is")
    return text


def show_value(value: Any) -> str:
    if isinstance(value, list):
        return ", ".join(value) if value else "none"
    return str(value) if str(value) != "" else "(empty)"


# ---------------------------------------------------------------- resolving


@dataclass
class Resolution:
    values: dict[str, Any] = field(default_factory=dict)
    decided_by: dict[str, str] = field(default_factory=dict)
    missing: list[Question] = field(default_factory=list)

    def not_by_user(self) -> dict[str, str]:
        return {k: v for k, v in self.decided_by.items() if v != "user"}


def resolve(
    given: dict[str, Any],
    accept_defaults: bool = False,
    weak_default: bool = False,
) -> Resolution:
    """Fill every question.

    A given value is the user's. A missing delegable value takes its default. A
    missing human-only value is listed in `missing`, unless `accept_defaults` hands
    the decision over and the question has a default (then it takes it, recorded as
    `agent`). `weak_default` is the default of `weak_topics` (true when the folder has
    results files).
    """
    res = Resolution()
    for q in load_questions():
        default = (
            ("yes" if weak_default else "no") if q.id == "weak_topics" else q.default
        )
        if q.id in given:
            res.values[q.id] = given[q.id]
            res.decided_by[q.id] = "user"
        elif q.delegable:
            res.values[q.id] = default
            res.decided_by[q.id] = "default"
        elif accept_defaults and default is not None:
            res.values[q.id] = default
            res.decided_by[q.id] = "agent"
        else:
            res.missing.append(q)
        f = q.followup
        if f is not None and q.id in res.values:
            text = str(given.get(f.id, "")).strip()
            if text and f.value in res.values[q.id]:
                res.values[f.id], res.decided_by[f.id] = text, "user"
            else:
                res.values[f.id], res.decided_by[f.id] = "", "default"
    return res


def to_brief(res: Resolution, focus_tags: list[str] | None = None) -> Brief:
    data: dict[str, Any] = {}

    def put(path_: str, value: Any) -> None:
        *path, leaf = path_.split(".")
        target = data
        for key in path:
            target = target.setdefault(key, {})
        target[leaf] = value

    for q in load_questions():
        if q.id not in res.values:
            continue
        v = res.values[q.id]
        put(q.field, (v == "yes") if q.to == "bool" else v)
        if q.followup is not None:
            put(q.followup.field, res.values[q.followup.id])
    data["focus_tags"] = list(focus_tags or []) if data.get("weak_topics") else []
    data["decided_by"] = dict(res.decided_by)
    return Brief.model_validate(data)


def needs_input(missing: list[Question], target: str) -> dict[str, Any]:
    """What `quiz brief --json` prints with exit code 3."""
    return {
        "status": "needs_input",
        "written": False,
        "message": "human-only values are missing; ask the user, or open a form",
        "missing": [
            {
                "id": q.id,
                "flag": q.flag,
                "label": q.label,
                "help": q.help,
                "choices": q.values or None,
            }
            for q in missing
        ],
        "forms": {"web": f"quiz brief {target} --web"},
    }


# ---------------------------------------------------------------- survey


def _one_line(text: str) -> str:
    return " ".join(text.split())


def survey_markdown(skip: set[str] | None = None) -> str:
    """The fullmark survey for the brief. `skip` leaves out questions already answered."""
    skip = skip or set()
    qs = [q for q in load_questions() if q.id not in skip]
    lines = [
        "---",
        "title: Quiz brief",
        "description: Tell Claude how you want the quiz set up. Nothing is scored.",
        "mode: survey",
        f"id: {SURVEY_ID}",
        "---",
        "",
        INTRO,
        "",
    ]
    section = None
    for q in qs:
        part = SECTIONS[q.section]
        if part != section:
            section = part
            lines += [f"# {part}", ""]
        attrs = []
        if q.type == "multi":
            attrs.append("type=multi")
        elif q.type in ("number", "text"):
            attrs.append("type=essay" if q.multiline else "type=short")
        attrs.append(f"id={q.id}")
        lines += [f"## {q.label} {{{' '.join(attrs)}}}", ""]
        note = _one_line(q.help)
        if q.delegable:
            note += (
                f" Default if skipped: {show_value(_shown_default(q))}."
                if q.default not in ("", [], None)
                else " Optional."
            )
        else:
            note = "Required. " + note
        lines += [note, ""]
        for c in q.choices:
            line = f"- [ ] {c.label}"
            if c.hint:
                line += f" - {_one_line(c.hint)}"
            if q.followup and q.followup.value == c.value:
                line += f' {{input="{q.followup.prompt}"}}'
            lines.append(line)
        if q.choices:
            lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def _shown_default(q: Question) -> Any:
    return (q.dynamic and f"{q.default} ({q.dynamic})") or q.default


class ResultsError(ValueError):
    pass


def answers_from_results(results: dict[str, Any]) -> dict[str, Any]:
    """Read a brief survey's results.json: the answered questions.

    A skipped question is simply absent, so the usual defaulting applies to it.
    """
    if results.get("format") != "fullmark-results":
        raise ResultsError(
            "not a fullmark results file (format is not 'fullmark-results')"
        )
    qid = str(results.get("quiz", {}).get("id", ""))
    if qid != SURVEY_ID:
        raise ResultsError(
            f"these results are for the quiz '{qid}', not the brief survey '{SURVEY_ID}'"
        )
    by_id = {q.id: q for q in load_questions()}
    given: dict[str, Any] = {}
    for item in results.get("questions", []):
        q = by_id.get(item.get("id"))
        resp = item.get("response")
        if q is None or not resp:
            continue
        try:
            if q.type == "choice":
                if resp.get("choice") is None:
                    continue
                given[q.id] = q.values[int(resp["choice"])]
            elif q.type == "multi":
                idx = resp.get("choices") or []
                if idx:
                    given[q.id] = [q.values[int(i)] for i in idx]
                    f = q.followup
                    if f is not None:
                        text = str(
                            (resp.get("inputs") or {}).get(
                                str(q.values.index(f.value)), ""
                            )
                        ).strip()
                        if text and f.value in given[q.id]:
                            given[f.id] = text
            else:
                text = str(resp.get("text", "")).strip()
                if text:
                    given[q.id] = parse_value(q, text)
        except (IndexError, ValueError) as exc:
            raise ResultsError(f"question '{q.id}': {exc}") from None
    return given


def write_brief_files(folder: Path, brief: Brief) -> list[Path]:
    """Write brief.yaml and content/ (with its README). Nothing existing is overwritten."""
    folder = Path(folder)
    content = folder / "content"
    content.mkdir(parents=True, exist_ok=True)
    made = [write_brief(folder, brief), content]
    readme = content / "README.md"
    if not readme.exists():
        readme.write_text(CONTENT_README, encoding="utf-8", newline="\n")
        made.append(readme)
    lint = write_markdownlint_config(folder)
    if lint:
        made.append(lint)
    return made


# ---------------------------------------------------------------- weak topics

RESULTS_GLOB = "*-results-*.json"
WEAK_BELOW = 80  # a topic under this percent in the latest attempt is a weak one


@dataclass
class WeakTopics:
    quiz_id: str | None = None
    files: list[Path] = field(default_factory=list)
    tags: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


def weak_topics(folder: Path) -> WeakTopics:
    """The weakest topics in the results files of the folder: the data of `quiz stats`.

    Only graded results count. When the folder holds results of several quizzes, the
    one attempted last is used. A topic is weak when its percent in the latest
    attempt is under WEAK_BELOW; at most three, weakest first."""
    from .report import ResultsError, load_results
    from .stats import collect

    out = WeakTopics()
    groups: dict[str, list[tuple[str, Path]]] = {}
    folder = Path(folder)
    for path in sorted(folder.glob(RESULTS_GLOB)) if folder.is_dir() else []:
        try:
            data = load_results(path)
        except ResultsError as exc:
            out.warnings.append(f"skipped {path.name}: {exc}")
            continue
        if data["attempt"].get("mode") == "survey":
            continue
        started = str(data["attempt"].get("started_at") or "")
        groups.setdefault(str(data["quiz"].get("id")), []).append((started, path))
    if not groups:
        return out
    out.quiz_id = max(groups, key=lambda k: max(s for s, _ in groups[k]))
    out.files = [p for _, p in sorted(groups[out.quiz_id])]
    try:
        stats, warnings = collect(out.files, None)
    except ResultsError as exc:
        out.warnings.append(str(exc))
        return out
    out.warnings += warnings
    out.tags = [w["topic"] for w in stats["weakest"] if w["percent"] < WEAK_BELOW]
    return out


# ---------------------------------------------------------------- the check

COUNT_TOLERANCE = 0.2
# the question types that can show each kind of question in the brief's `mix`
MIX_TYPES = {
    "recall": {"single", "multi", "truefalse", "short", "blanks", "matching"},
    "understanding": {"single", "multi", "ordering", "matching", "essay", "short"},
    "calculation": {"numeric", "fields"},
    "code": {"code"},
    "essay": {"essay"},
}
# the files that make a kind of material plausible in content/
KIND_EXTENSIONS = {
    "lecture-slides": (".pdf", ".pptx", ".ppt", ".odp", ".key"),
    "textbook": (".pdf", ".epub", ".djvu", ".docx"),
    "notes": (".md", ".txt", ".docx", ".pdf", ".pptx", ".rtf", ".odt"),
    "past-exams": (".pdf", ".docx", ".doc", ".md", ".txt", ".png", ".jpg", ".jpeg"),
    "lab-manual": (".pdf", ".docx", ".doc", ".md"),
}
KIND_NAMES = {
    "lecture-slides": "lecture slides",
    "textbook": "a textbook chapter",
    "notes": "notes",
    "past-exams": "past exams",
    "lab-manual": "a lab manual",
}
SOURCE_NOTE_RE = re.compile(r"(?im)^\W*source\W*:")
FIX = (
    "put the files in content/, or say where they are in 'elsewhere' "
    "(brief.yaml: content.elsewhere)"
)


def content_messages(folder: Path, brief: Brief) -> list[str]:
    """Compare the kinds ticked in the brief with the files in `content/`."""
    c = brief.content
    if c.elsewhere.strip():
        return []
    root = Path(folder) / "content"
    files = [
        f
        for f in (root.rglob("*") if root.is_dir() else [])
        if f.is_file() and f.relative_to(root).as_posix() != "README.md"
    ]
    exts = {f.suffix.lower() for f in files}
    out = []
    for kind, wanted in KIND_EXTENSIONS.items():
        if kind in c.kinds and not exts & set(wanted):
            out.append(
                f"the brief says the quiz is built from {KIND_NAMES[kind]}, but "
                f"content/ has no {' '.join(wanted)} file; {FIX}"
            )
    if not c.kinds and not files:
        out.append(f"the brief ticks no kind of material and content/ is empty; {FIX}")
    return out


def brief_findings(folder: Path, quiz: Quiz, text: str, file: str) -> Findings:
    """Warnings (rule ids brief.*) for a quiz held against the brief.yaml beside it."""
    from pydantic import ValidationError

    found = Findings(file)

    def warn(rule: str, msg: str) -> None:
        found.append(Finding(file, 1, "warning", msg, None, rule))

    try:
        brief = load_brief(folder)
    except (ValidationError, yaml.YAMLError) as exc:
        warn(
            "brief.invalid", f"brief.yaml cannot be read, so it was not checked: {exc}"
        )
        return found
    if brief is None:
        return found
    n = len(quiz.questions)
    if (
        brief.count
        and n != brief.count
        and (abs(n - brief.count) <= COUNT_TOLERANCE * brief.count)
    ):
        found.append(
            Finding(
                file,
                1,
                "info",
                f"{n} questions; the brief asks for {brief.count}",
                None,
                "brief.count-near",
            )
        )
    if brief.count and abs(n - brief.count) > COUNT_TOLERANCE * brief.count:
        lo = int(brief.count * (1 - COUNT_TOLERANCE) + 0.999)
        hi = int(brief.count * (1 + COUNT_TOLERANCE))
        warn(
            "brief.count",
            f"the brief asks for {brief.count} questions (within 20%: {lo} to {hi}) "
            f"but the quiz has {n}",
        )
    if brief.purpose != "survey":
        types = {q.type for q in quiz.questions if not q.ungraded}
        for kind in brief.mix:
            if kind in MIX_TYPES and not types & MIX_TYPES[kind]:
                warn(
                    "brief.mix",
                    f"the brief asks for {kind} questions, but the quiz has none "
                    f"({', '.join(sorted(MIX_TYPES[kind]))})",
                )
    if "past-exams" in brief.content.kinds and not SOURCE_NOTE_RE.search(text):
        warn(
            "brief.past-exams",
            "the brief says the quiz mirrors past exams, but no question has a "
            "'Source:' note pointing to them; add e.g. 'Source: exam-2025.pdf, "
            "question 3' to the explanations",
        )
    for msg in content_messages(folder, brief):
        warn("brief.content-kinds", msg)
    return found
