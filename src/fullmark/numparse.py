"""Parse learner/author numbers: integers, decimals, scientific notation, a/b fractions."""

import re

_NUM = r"[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?"  # ASCII digits, like JS \d
_NUM_RE = re.compile(rf"^{_NUM}$")
_FRAC_RE = re.compile(rf"^({_NUM})\s*/\s*({_NUM})$")


def parse_number(text: str) -> float | None:
    """Return the value, or None if `text` is not an accepted number."""
    s = text.strip().replace("\u2212", "-")
    if _NUM_RE.match(s):
        return float(s)
    m = _FRAC_RE.match(s)
    if m:
        den = float(m.group(2))
        if den != 0:
            return float(m.group(1)) / den
    return None


def has_comma_decimal(text: str) -> bool:
    """True for input like '3,14' that looks like a comma decimal separator."""
    return (
        bool(re.match(r"^[+-]?[0-9]*,[0-9]+$", text.strip()))
        and parse_number(text) is None
    )
