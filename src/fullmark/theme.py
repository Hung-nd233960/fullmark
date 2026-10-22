"""Muted palette (warm paper light, soft slate dark): CSS variables and Pygments styles.

Names are semantic (bg, card, accent, ok, bad, ...), the same in both themes.

This is the only place that holds color literals; quiz.css refers to var(--name) only.
"""

from pygments.formatters import HtmlFormatter
from pygments.style import Style
from pygments.token import (
    Comment,
    Error,
    Generic,
    Keyword,
    Name,
    Number,
    Operator,
    Punctuation,
    String,
    Text,
    Whitespace,
)

# Surface tiers, lowest to highest: sunken (inputs, code), bg (the page), surface (controls),
# card (questions, header, side panel). Light and dark both lift cards above the page.
LIGHT = {
    "bg": "#eceae5", "surface": "#f4f3ef", "card": "#fcfcfa", "sunken": "#e4e2dc",
    "line": "#d6d4cd", "line-strong": "#8c8b83",
    "text": "#2a2b31", "muted": "#55554f",
    "accent": "#4f6a94", "on-accent": "#fcfcfa",
    "ok": "#4f7f58", "bad": "#a8504f", "warn": "#a38538", "info": "#3f6a97",
    "flag": "#b5708f", "hint": "#5d8fae", "orange": "#b8793f",
}  # fmt: skip

DARK = {
    "bg": "#1b1d22", "surface": "#262a31", "card": "#2c3038", "sunken": "#15171b",
    "line": "#464c57", "line-strong": "#7b8394",
    "text": "#d9dce2", "muted": "#a9afba",
    "accent": "#8fa8d4", "on-accent": "#15171b",
    "ok": "#92b99a", "bad": "#d08a88", "warn": "#cfb277", "info": "#8fb0d6",
    "flag": "#cf9bb4", "hint": "#8dbad6", "orange": "#d2a373",
}  # fmt: skip

THEMES = {"light": LIGHT, "dark": DARK}


def theme_css() -> str:
    """CSS custom properties for both themes."""
    blocks = []
    for name, pal in THEMES.items():
        decls = [f"  --{k}: {v};" for k, v in pal.items()]
        decls.append(f"  color-scheme: {name};")
        blocks.append(f':root[data-theme="{name}"] {{\n' + "\n".join(decls) + "\n}")
    return "\n".join(blocks)


def _luminance(color: str) -> float:
    ch = [int(color[i : i + 2], 16) / 255 for i in (1, 3, 5)]
    ch = [x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4 for x in ch]
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]


def _contrast(a: str, b: str) -> float:
    hi, lo = sorted((_luminance(a), _luminance(b)), reverse=True)
    return (hi + 0.05) / (lo + 0.05)


def _legible(color: str, bg: str, ratio: float = 4.6) -> str:
    """Nudge `color` toward black (light background) or white (dark) until it reads on `bg`.

    The pastel palette is gentle on purpose; code tokens still need WCAG AA (4.5:1).
    """
    target = (0, 0, 0) if _luminance(bg) > 0.5 else (255, 255, 255)
    rgb = [int(color[i : i + 2], 16) for i in (1, 3, 5)]
    for step in range(21):
        mix = [round(v + (t - v) * step / 20) for v, t in zip(rgb, target, strict=True)]
        out = "#" + "".join(f"{v:02x}" for v in mix)
        if _contrast(out, bg) >= ratio:
            return out
    return out


def _style(pal: dict[str, str]) -> type[Style]:
    def c(name: str) -> str:
        return _legible(pal[name], pal["sunken"])

    class QuizStyle(Style):
        background_color = pal["sunken"]
        highlight_color = pal["surface"]
        styles = {  # noqa: RUF012
            Text: c("text"),
            Whitespace: pal["line-strong"],
            Comment: f"italic {c('muted')}",
            Keyword: c("accent"),
            Keyword.Type: c("warn"),
            Keyword.Constant: c("orange"),
            Operator: c("hint"),
            Operator.Word: c("accent"),
            Punctuation: c("muted"),
            Name: c("text"),
            Name.Builtin: c("bad"),
            Name.Function: c("info"),
            Name.Class: c("warn"),
            Name.Namespace: c("warn"),
            Name.Decorator: c("orange"),
            Name.Attribute: c("warn"),
            Name.Tag: c("info"),
            Name.Constant: c("orange"),
            Name.Exception: c("orange"),
            String: c("ok"),
            String.Escape: c("flag"),
            String.Interpol: c("flag"),
            Number: c("orange"),
            Generic.Deleted: c("bad"),
            Generic.Inserted: c("ok"),
            Generic.Heading: f"bold {c('info')}",
            Generic.Emph: "italic",
            Generic.Strong: "bold",
            Error: c("bad"),
        }

    return QuizStyle


QuizLight = _style(LIGHT)
QuizDark = _style(DARK)


def pygments_css() -> str:
    """Token colors scoped under each theme's data-theme attribute."""
    out = []
    for name, style in (("light", QuizLight), ("dark", QuizDark)):
        fmt = HtmlFormatter(style=style)
        out.append(fmt.get_style_defs(f':root[data-theme="{name}"] .highlight'))
    return "\n".join(out)
