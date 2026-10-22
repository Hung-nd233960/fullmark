"""Shared Markdown helpers."""

import re

from markdown_it import MarkdownIt
from mdit_py_plugins.dollarmath import dollarmath_plugin
from mdit_py_plugins.front_matter import front_matter_plugin


def make_md() -> MarkdownIt:
    md = MarkdownIt("commonmark").enable(["table", "strikethrough"])
    md.use(front_matter_plugin)
    md.use(dollarmath_plugin, allow_space=False, allow_digits=True, double_inline=True)
    return md


_FENCE_RE = re.compile(
    r"^(?P<f>`{3,}|~{3,})[^\n]*\n.*?^(?P=f)[ \t]*$", re.DOTALL | re.MULTILINE
)
_INLINE_CODE_RE = re.compile(r"(`+)(?!`).+?(?<!`)\1(?!`)", re.DOTALL)


def strip_code(text: str) -> str:
    """Blank out fenced and inline code (keeps length and newlines)."""

    def blank(m: re.Match) -> str:
        return re.sub(r"[^\n]", " ", m.group(0))

    return _INLINE_CODE_RE.sub(blank, _FENCE_RE.sub(blank, text))


_MATH_RE = re.compile(r"\$\$.+?\$\$|\$(?!\s)[^$\n]+?(?<!\s)\$", re.DOTALL)


def math_spans(text: str) -> list[str]:
    """Math fragments outside code."""
    return [m.group(0) for m in _MATH_RE.finditer(strip_code(text))]


def has_math(text: str) -> bool:
    return bool(math_spans(text))
