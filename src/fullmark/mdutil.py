"""Shared Markdown helpers."""

import re
from pathlib import Path

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


MARKDOWNLINT_CONFIG = """{
  "MD013": false,
  "MD025": false,
  "MD028": false
}
"""


def write_markdownlint_config(folder: Path) -> Path | None:
    """Write `.markdownlint.json` into a quiz folder unless one already exists.

    The quiz syntax trips three default rules: several `#` sections (MD025), a
    `[!hint]` callout directly followed by `[!explanation]` (MD028) and long
    lines (MD013). Returns the path written, or None when a config was there."""
    path = Path(folder) / ".markdownlint.json"
    if any(
        (Path(folder) / n).exists()
        for n in (
            ".markdownlint.json",
            ".markdownlint.jsonc",
            ".markdownlint.yaml",
            ".markdownlint.yml",
            ".markdownlint-cli2.jsonc",
            ".markdownlint-cli2.yaml",
        )
    ):
        return None
    Path(folder).mkdir(parents=True, exist_ok=True)
    path.write_text(MARKDOWNLINT_CONFIG, encoding="utf-8", newline="\n")
    return path
