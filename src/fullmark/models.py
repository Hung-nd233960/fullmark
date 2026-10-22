"""Pydantic models for quizzes, questions and answer specs."""

import re
from dataclasses import dataclass
from typing import Annotated, Any, Literal

from pydantic import (
    BaseModel,
    BeforeValidator,
    ConfigDict,
    ValidationError,
    field_validator,
    model_validator,
)

QUESTION_TYPES = (
    "single",
    "multi",
    "truefalse",
    "numeric",
    "short",
    "blanks",
    "fields",
    "ordering",
    "matching",
    "essay",
    "code",
    "scale",
)
AUTO_TYPES = (
    "single",
    "multi",
    "truefalse",
    "numeric",
    "short",
    "blanks",
    "fields",
    "ordering",
    "matching",
)


# ---------------------------------------------------------------- findings


@dataclass
class Finding:
    file: str
    line: int
    severity: str  # "error" | "warning" | "info"
    message: str
    question: str | None = None
    rule: str | None = None  # set by rules that have an id, such as review.fix

    def format(self) -> str:
        q = f"{self.question}: " if self.question else ""
        r = f"[{self.rule}] " if self.rule else ""
        return f"{self.file}:{self.line}: {self.severity}: {q}{r}{self.message}"

    def as_dict(self) -> dict:
        d = {
            "file": self.file,
            "line": self.line,
            "severity": self.severity,
            "question": self.question,
            "message": self.message,
        }
        if self.rule:
            d["rule"] = self.rule
        return d


class Findings(list):
    def __init__(self, file: str):
        super().__init__()
        self.file = file

    def error(self, line: int, msg: str, q: str | None = None) -> None:
        self.append(Finding(self.file, line, "error", msg, q))

    def warn(self, line: int, msg: str, q: str | None = None) -> None:
        self.append(Finding(self.file, line, "warning", msg, q))

    @property
    def has_errors(self) -> bool:
        return any(f.severity == "error" for f in self)

    def sorted(self) -> list[Finding]:
        return sorted(self, key=lambda f: (f.line, f.severity != "error"))


def format_pydantic_errors(exc: ValidationError) -> list[tuple[str, str]]:
    """(key path, message) pairs in the style: 'value' must be a number, got 'one'."""
    out = []
    for e in exc.errors():
        loc = ".".join(str(p) for p in e["loc"])
        t = e["type"]
        if t in ("float_parsing", "int_parsing", "float_type", "int_type"):
            msg = f"'{loc}' must be a number, got {e['input']!r}"
        elif t == "extra_forbidden":
            msg = f"unknown key '{loc}'"
        elif t == "missing":
            msg = f"missing required key '{loc}'"
        elif t == "value_error":
            msg = str(e["ctx"]["error"]) if e.get("ctx") else e["msg"]
        else:
            msg = f"'{loc}' {e['msg'][0].lower() + e['msg'][1:]}"
        out.append((loc, msg))
    return out


# ---------------------------------------------------------------- helpers

_TIME_RE = re.compile(r"^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$")


def parse_duration(value: Any) -> int:
    """'90s', '45m', '1h', '1h30m' -> seconds. Raises ValueError."""
    bad = f"bad duration {value!r}; use e.g. 90s, 45m, 1h, 1h30m"
    if not isinstance(value, str) or not value.strip():
        raise ValueError(bad)
    m = _TIME_RE.match(value.strip())
    if not m or not any(m.groups()):
        raise ValueError(bad)
    h, mi, se = (int(g) if g else 0 for g in m.groups())
    total = h * 3600 + mi * 60 + se
    if total <= 0:
        raise ValueError("duration must be greater than zero")
    return total


def _num(v: Any) -> Any:
    if isinstance(v, bool):
        raise ValueError("must be a number, not true/false")  # noqa: TRY004 - pydantic turns ValueError into a finding
    return v


Num = Annotated[float, BeforeValidator(_num)]


def _to_str(v: Any) -> Any:
    if isinstance(v, bool):
        return v
    if isinstance(v, (int, float)):
        return str(v)
    return v


Text = Annotated[str, BeforeValidator(_to_str)]


def _rubric(v: Any) -> Any:
    """YAML turns '- Name: detail' into a dict; flatten back to 'Name: detail'."""
    if v is None:
        return []
    if not isinstance(v, list):
        raise ValueError("rubric must be a list")  # noqa: TRY004
    out = []
    for item in v:
        if isinstance(item, dict):
            out.extend(
                f"{k}: {val}" if val not in (None, "") else str(k)
                for k, val in item.items()
            )
        else:
            out.append(str(item))
    return out


Rubric = Annotated[list[str], BeforeValidator(_rubric)]


# ---------------------------------------------------------------- front matter


class FrontMatter(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str
    description: str = ""
    id: str | None = None
    mode: Literal["quiz", "survey"] = "quiz"
    review: bool = False  # set only by `quiz review`
    time_limit: str | None = None
    on_timeout: Literal["submit", "warn"] = "submit"
    feedback: Literal["end", "instant"] = "end"
    theme: Literal["auto", "light", "dark"] = "auto"
    shuffle_questions: bool = False
    shuffle_choices: bool = False
    multi_scoring: Literal["partial", "all_or_nothing"] = "partial"
    pass_mark: float | None = None
    pick: int | None = None  # question bank: draw this many per attempt
    tags: list[str] = []
    generated_by: str | None = None  # exact model ID that wrote this version

    @field_validator("generated_by", mode="before")
    @classmethod
    def _gb(cls, v: Any) -> Any:
        if v is not None and (
            not isinstance(v, str) or not v.strip() or "\n" in v or "\r" in v
        ):
            raise ValueError(
                "generated_by must be a non-empty one-line string, "
                "the exact model ID that wrote the quiz (for example claude-opus-5-5)"
            )
        return v.strip() if isinstance(v, str) else v

    @field_validator("title")
    @classmethod
    def _title(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("title must not be empty")
        return v

    @field_validator("time_limit", mode="before")
    @classmethod
    def _tl(cls, v: Any) -> Any:
        if v is not None:
            parse_duration(v)
        return v

    @field_validator("pass_mark")
    @classmethod
    def _pm(cls, v: float | None) -> float | None:
        if v is not None and not 0 <= v <= 100:
            raise ValueError("pass_mark must be between 0 and 100")
        return v

    @field_validator("pick")
    @classmethod
    def _pick(cls, v: int | None) -> int | None:
        if v is not None and v < 1:
            raise ValueError("pick must be at least 1")
        return v

    @field_validator("tags", mode="before")
    @classmethod
    def _tags(cls, v: Any) -> Any:
        if isinstance(v, str):
            return [t.strip() for t in v.split(",") if t.strip()]
        return v

    @property
    def time_limit_seconds(self) -> int | None:
        return parse_duration(self.time_limit) if self.time_limit else None


# ---------------------------------------------------------------- answer specs


class _Spec(BaseModel):
    model_config = ConfigDict(extra="forbid")


class TrueFalseSpec(_Spec):
    value: bool

    @field_validator("value", mode="before")
    @classmethod
    def _strict(cls, v: Any) -> Any:
        if not isinstance(v, bool):
            raise ValueError(f"'value' must be true or false, got {v!r}")  # noqa: TRY004
        return v

    def canonical(self) -> dict:
        return {"value": self.value}


class _NumericMixin(BaseModel):
    value: Num | None = None
    values: list[Num] = []
    tolerance: Num = 0
    rel_tolerance: Num | None = None

    @model_validator(mode="after")
    def _check_num(self):
        if self.tolerance < 0 or (
            self.rel_tolerance is not None and self.rel_tolerance < 0
        ):
            raise ValueError("tolerance must not be negative")
        if "tolerance" in self.model_fields_set and self.rel_tolerance is not None:
            raise ValueError("use either 'tolerance' or 'rel_tolerance', not both")
        return self

    def targets(self) -> list[float]:
        return ([self.value] if self.value is not None else []) + list(self.values)


class NumericSpec(_Spec, _NumericMixin):
    unit: str = ""

    @model_validator(mode="after")
    def _need_value(self):
        if not self.targets():
            raise ValueError("numeric answer needs 'value' (or 'values')")
        return self

    def canonical(self) -> dict:
        return {
            "values": self.targets(),
            "tolerance": self.tolerance,
            "rel_tolerance": self.rel_tolerance,
            "unit": self.unit,
        }


class _TextMixin(BaseModel):
    accept: list[Text] = []
    patterns: list[str] = []


class ShortSpec(_Spec, _TextMixin):
    @model_validator(mode="after")
    def _need_any(self):
        if not self.accept and not self.patterns:
            raise ValueError("needs at least one 'accept' string or 'patterns' regex")
        return self

    def canonical(self) -> dict:
        return {"accept": self.accept, "patterns": self.patterns}


class FieldSpec(_Spec, _NumericMixin, _TextMixin):
    label: str
    points: Num | None = None

    @property
    def kind(self) -> str:
        if self.targets():
            return "numeric"
        if self.accept or self.patterns:
            return "text"
        return "none"

    @model_validator(mode="after")
    def _one_kind(self):
        if self.targets() and (self.accept or self.patterns):
            raise ValueError(
                f"field {self.label!r}: use value/values or accept/patterns, not both"
            )
        if self.points is not None and self.points <= 0:
            raise ValueError("field points must be greater than zero")
        return self

    def canonical(self) -> dict:
        return {
            "label": self.label,
            "kind": self.kind,
            "points": self.points,
            "values": self.targets(),
            "tolerance": self.tolerance,
            "rel_tolerance": self.rel_tolerance,
            "accept": self.accept,
            "patterns": self.patterns,
        }


class FieldsSpec(_Spec):
    fields: list[FieldSpec]

    @field_validator("fields")
    @classmethod
    def _nonempty(cls, v: list[FieldSpec]) -> list[FieldSpec]:
        if not v:
            raise ValueError("'fields' needs at least one entry")
        return v

    def canonical(self) -> dict:
        return {"fields": [f.canonical() for f in self.fields]}


class EssaySpec(_Spec):
    min_words: int = 0
    max_words: int = 0
    rubric: Rubric = []
    sample_answer: str = ""
    show_sample: bool = False
    scoring: Literal["points", "band"] = "points"

    @model_validator(mode="after")
    def _words(self):
        if self.min_words < 0 or self.max_words < 0:
            raise ValueError("word limits must not be negative")
        if self.max_words and self.max_words < self.min_words:
            raise ValueError("max_words is smaller than min_words")
        return self


class CodeSpec(_Spec):
    language: str
    starter: str = ""
    rubric: Rubric = []
    reference: str = ""
    show_reference: bool = False


class ScaleSpec(_Spec):
    min: int = 1
    max: int = 5
    labels: dict[int, Text] = {}

    @model_validator(mode="after")
    def _range(self):
        if not 1 <= self.max - self.min <= 10:
            raise ValueError("scale: max - min must be between 1 and 10")
        for k in self.labels:
            if not self.min <= k <= self.max:
                raise ValueError(
                    f"scale label {k} is outside the range {self.min} to {self.max}"
                )
        return self

    def canonical(self) -> dict:
        return {
            "min": self.min,
            "max": self.max,
            "labels": {str(k): v for k, v in sorted(self.labels.items())},
        }


SPEC_MODELS: dict[str, Any] = {
    "truefalse": TrueFalseSpec,
    "numeric": NumericSpec,
    "short": ShortSpec,
    "fields": FieldsSpec,
    "essay": EssaySpec,
    "code": CodeSpec,
    "scale": ScaleSpec,
}


# ---------------------------------------------------------------- quiz structure


class Choice(BaseModel):
    md: str
    correct: bool
    line: int
    input: str | None = (
        None  # prompt of the follow-up text input, if the choice has one
    )


class Question(BaseModel):
    id: str
    index: int  # 1-based position in document order
    line: int
    section: int  # index into Quiz.sections
    type: str
    title_md: str
    prompt_md: str = ""
    points: float = 1
    tags: list[str] = []
    shuffle: bool | None = None
    case: Literal["sensitive", "insensitive"] = "insensitive"
    graded: bool = True  # False for graded=false and for every survey question
    choices: list[Choice] = []
    items: list[Choice] = []  # ordering and matching: the list items (correct=False)
    match: dict | None = None  # matching: {lefts, rights, answer}, set by validate
    hint_md: str = ""
    explanation_md: str = ""
    answer_raw: dict | None = None
    answer_line: int = 0
    spec: Any = None  # validated spec model (None for single/multi/blanks)
    blanks: list[dict] = []

    @property
    def label(self) -> str:
        return f"{self.id} ({self.type})"

    @property
    def ungraded(self) -> bool:
        """Collects an answer with no right one: never scored, never AI graded."""
        return self.type == "scale" or not self.graded

    @property
    def auto(self) -> bool:
        return self.type in AUTO_TYPES and not self.ungraded


class Section(BaseModel):
    title: str
    line: int
    time: str | None = None
    pick: int | None = None  # question bank: draw this many from this section
    intro_md: str = ""


class Quiz(BaseModel):
    meta: FrontMatter
    id: str
    source_file: str
    source_hash: str
    preamble_md: str = ""
    sections: list[Section]
    questions: list[Question]

    @property
    def total_points(self) -> float:
        return sum(q.points for q in self.questions)

    @property
    def has_bank(self) -> bool:
        return self.meta.pick is not None or any(s.pick for s in self.sections)

    def bank_groups(self) -> list[tuple[list[Question], int]]:
        """(pool, number drawn) pairs. Sections without a pick contribute every question."""
        if self.meta.pick is not None:
            return [(self.questions, self.meta.pick)]
        out = []
        for i, sec in enumerate(self.sections):
            pool = [q for q in self.questions if q.section == i]
            out.append((pool, sec.pick or len(pool)))
        return out
