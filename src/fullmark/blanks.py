"""Inline blanks: [[answer|variant]] and numeric [[=value±tolerance]]."""

import re
from dataclasses import dataclass, field

from .numparse import parse_number

BLANK_RE = re.compile(r"\[\[(.+?)\]\]")
_NUMERIC_RE = re.compile(r"^=\s*(\S+?)\s*(?:(?:±|\+-)\s*(\S+))?$")


@dataclass
class Blank:
    raw: str
    variants: list[str] = field(default_factory=list)
    numeric: bool = False
    value: float | None = None
    tolerance: float = 0.0
    start: int = 0
    end: int = 0

    def spec(self) -> dict:
        if self.numeric:
            return {"numeric": True, "value": self.value, "tolerance": self.tolerance}
        return {"numeric": False, "accept": self.variants}


def parse_blank(inner: str) -> Blank:
    """Parse the text between [[ and ]]. Raises ValueError with a message on bad syntax."""
    if inner.startswith("="):
        m = _NUMERIC_RE.match(inner)
        value = parse_number(m.group(1)) if m else None
        if value is None:
            raise ValueError(f"bad numeric blank '[[{inner}]]'; use [[=0.5±0.01]]")
        tol = 0.0
        if m.group(2) is not None:
            t = parse_number(m.group(2))
            if t is None or t < 0:
                raise ValueError(f"bad tolerance in '[[{inner}]]'")
            tol = t
        return Blank(raw=inner, numeric=True, value=value, tolerance=tol)
    parts = [p.strip() for p in re.split(r"(?<!\\)\|", inner)]
    parts = [p.replace("\\|", "|") for p in parts]
    if not all(parts):
        raise ValueError(f"empty answer in blank '[[{inner}]]'")
    return Blank(raw=inner, variants=parts)


def find_blanks(text: str) -> list[Blank]:
    out = []
    for m in BLANK_RE.finditer(text):
        b = parse_blank(m.group(1))
        b.start, b.end = m.start(), m.end()
        out.append(b)
    return out


def blank_bucket(blanks: list[Blank]) -> str:
    """Start-width bucket (s|m|l|xl) for a question, from its longest accepted answer.

    One bucket per question, so no single blank reveals its own answer length.
    """
    longest = 0
    for b in blanks:
        texts = [f"{b.value:g}"] if b.numeric else b.variants
        longest = max([longest, *(len(t) for t in texts)])
    if longest <= 5:
        return "s"
    if longest <= 9:
        return "m"
    return "l" if longest <= 15 else "xl"
