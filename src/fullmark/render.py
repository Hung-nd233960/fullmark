"""Models -> HTML fragments: Markdown, Pygments, math markers, media data URIs, blanks."""

import base64
import html
import mimetypes
import re
from pathlib import Path
from urllib.parse import unquote

from markdown_it import MarkdownIt
from mdit_py_plugins.dollarmath import dollarmath_plugin
from pygments import highlight
from pygments.formatters import HtmlFormatter
from pygments.lexers import TextLexer, get_lexer_by_name
from pygments.util import ClassNotFound

from .blanks import BLANK_RE
from .validate import AUDIO_EXTS

_MIME = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".mp3": "audio/mpeg",
    ".ogg": "audio/ogg",
    ".wav": "audio/wav",
    ".m4a": "audio/mp4",
}
_PLACEHOLDER_RE = re.compile(r"QZBLANK(\d+)QZ")
_SINGLE_P_RE = re.compile(r"^<p>((?:(?!</?p>).)*)</p>\n?$", re.DOTALL)


def highlight_code(code: str, lang: str) -> str:
    """Highlighted HTML (spans with Pygments classes, no wrapper)."""
    try:
        lexer = get_lexer_by_name(lang) if lang else TextLexer()
    except ClassNotFound:
        lexer = TextLexer()
    lexer.stripnl = False
    return highlight(code.rstrip("\n"), lexer, HtmlFormatter(nowrap=True))


def code_block(code: str, lang: str) -> str:
    cls = re.sub(r"[^\w+#-]", "", lang or "text")
    return f'<pre class="qm-code"><code class="highlight language-{cls}">{highlight_code(code, lang)}</code></pre>'


class Renderer:
    def __init__(self, base_dir: Path):
        self.base_dir = base_dir
        self.has_math = False
        self.media_bytes = 0
        md = MarkdownIt("commonmark", {"html": False, "highlight": self._highlight})
        md.enable(["table", "strikethrough"])
        md.use(
            dollarmath_plugin, allow_space=False, allow_digits=True, double_inline=True
        )
        md.add_render_rule("math_inline", self._math_inline)
        md.add_render_rule("math_inline_double", self._math_display)
        md.add_render_rule("math_block", self._math_display)
        md.add_render_rule("image", self._image)
        self.md = md

    # ---- markdown-it callbacks
    def _highlight(self, code: str, lang: str, attrs: str) -> str:
        return code_block(code, (lang or "").split()[0] if lang else "")

    def _math_inline(self, tokens, idx, options, env) -> str:
        self.has_math = True
        return f'<span class="qm-math">\\({html.escape(tokens[idx].content, quote=False)}\\)</span>'

    def _math_display(self, tokens, idx, options, env) -> str:
        self.has_math = True
        return f'<div class="qm-math qm-display">\\[{html.escape(tokens[idx].content, quote=False)}\\]</div>'

    def _image(self, tokens, idx, options, env) -> str:
        t = tokens[idx]
        src = unquote(t.attrGet("src") or "")
        alt = html.escape(t.content, quote=True)
        path = self.base_dir / src
        ext = path.suffix.lower()
        data = path.read_bytes()
        self.media_bytes += len(data)
        mime = (
            _MIME.get(ext)
            or mimetypes.guess_type(path.name)[0]
            or "application/octet-stream"
        )
        uri = f"data:{mime};base64,{base64.b64encode(data).decode('ascii')}"
        if ext in AUDIO_EXTS:
            return (
                f'<span class="qm-audio"><audio controls preload="none" src="{uri}"></audio>'
                f'<span class="qm-caption">{alt}</span></span>'
            )
        return f'<img class="qm-img" src="{uri}" alt="{alt}">'

    # ---- public helpers
    def block(self, text: str) -> str:
        return self.md.render(text) if text.strip() else ""

    def fragment(self, text: str) -> str:
        """Render Markdown; a lone paragraph is unwrapped so it can sit inline."""
        out = self.block(text)
        m = _SINGLE_P_RE.match(out)
        return m.group(1) if m else out

    def blanks(self, text: str, counter: list[int]) -> str:
        """Replace [[...]] with inert placeholders (numbered through `counter`)."""

        def sub(_m: re.Match) -> str:
            n = counter[0]
            counter[0] += 1
            return f"QZBLANK{n}QZ"

        return BLANK_RE.sub(sub, text)


def inject_blank_inputs(html_text: str, bucket: str = "m") -> str:
    def sub(m: re.Match) -> str:
        n = int(m.group(1))
        return (
            f'<input type="text" class="qm-blank qm-blank-{bucket}" data-blank="{n}" aria-label="Blank {n + 1}" '
            'autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false">'
        )

    return _PLACEHOLDER_RE.sub(sub, html_text)
