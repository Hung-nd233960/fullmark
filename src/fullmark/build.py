"""Assemble the final single-file HTML quiz."""

import base64
import json
import os
import re
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, StrictUndefined

from . import __version__
from .blanks import blank_bucket, find_blanks
from .grading import grading_spec
from .models import Question, Quiz, parse_duration
from .render import Renderer, code_block, inject_blank_inputs
from .theme import pygments_css, theme_css

PKG = Path(__file__).parent
WARN_BYTES = 20 * 1024 * 1024
MAX_BYTES = 100 * 1024 * 1024
_FONT_URL_RE = re.compile(r"url\((fonts/[^)]+?\.woff2)\)\s*format\(\"woff2\"\)")
_FONT_FALLBACK_RE = re.compile(
    r",\s*url\(fonts/[^)]+?\.(?:woff|ttf)\)\s*format\(\"(?:woff|truetype)\"\)"
)


@dataclass
class BuildResult:
    html: str
    size: int
    has_math: bool
    warnings: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)


# ---------------------------------------------------------------- answer key


def _keystream(seed_hex: str):
    """mulberry32 seeded by the quiz hash; mirrored in quiz.js."""
    m = 0xFFFFFFFF
    a = int(seed_hex[:8], 16)
    while True:
        a = (a + 0x6D2B79F5) & m
        t = ((a ^ (a >> 15)) * (a | 1)) & m
        t = (((t + (((t ^ (t >> 7)) * (t | 61)) & m)) & m) ^ t) & m
        yield (t ^ (t >> 14)) & 0xFF


def obfuscate(payload: dict, source_hash: str) -> str:
    """XOR + base64. This only stops casual peeking; it is not security."""
    raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    ks = _keystream(source_hash)
    return base64.b64encode(bytes(b ^ next(ks) for b in raw)).decode("ascii")


def deobfuscate(blob: str, source_hash: str) -> dict:
    ks = _keystream(source_hash)
    raw = bytes(b ^ next(ks) for b in base64.b64decode(blob))
    return json.loads(raw.decode("utf-8"))


# ---------------------------------------------------------------- data


def _question_data(q: Question, quiz: Quiz, r: Renderer) -> tuple[dict, dict]:
    """(public render data, answer-key entry) for one question."""
    counter = [0]
    is_blanks = q.type == "blanks"
    title_md = r.blanks(q.title_md, counter) if is_blanks else q.title_md
    prompt_md = r.blanks(q.prompt_md, counter) if is_blanks else q.prompt_md
    found = find_blanks(q.title_md + " \n" + q.prompt_md) if is_blanks else []
    bucket = blank_bucket(found)
    wrap = (lambda s: inject_blank_inputs(s, bucket)) if is_blanks else (lambda s: s)
    spec = q.spec
    data = {
        "id": q.id,
        "index": q.index,
        "section": q.section,
        "type": q.type,
        "points": q.points,
        "ungraded": q.ungraded,
        "tags": q.tags,
        "title_md": q.title_md,
        "title_html": wrap(r.fragment(title_md)),
        "prompt_html": wrap(r.block(prompt_md)),
        "hint_html": r.block(q.hint_md),
        "shuffle": q.shuffle if q.shuffle is not None else quiz.meta.shuffle_choices,
        "choices": [r.fragment(c.md) for c in q.choices],
        "n_blanks": len(find_blanks(q.title_md + " \n" + q.prompt_md))
        if is_blanks
        else 0,
    }
    key = {"spec": grading_spec(q, quiz), "explanation_html": r.block(q.explanation_md)}
    followups = {str(i): c.input for i, c in enumerate(q.choices) if c.input}
    if followups:
        data["followups"] = (
            followups  # choice index -> prompt of its follow-up text input
        )
    if q.type == "ordering":
        data["items"] = [r.fragment(c.md) for c in q.items]
    elif q.type == "matching":
        data["lefts"] = [r.fragment(t) for t in q.match["lefts"]]
        data["rights"] = [r.fragment(t) for t in q.match["rights"]]
    elif q.type == "fields":
        data["fields"] = [{"label_html": r.fragment(f.label)} for f in spec.fields]
    elif q.type == "scale":
        data["scale"] = spec.canonical()
    elif q.type == "numeric":
        data["unit"] = spec.unit
    elif q.type == "essay":
        data["min_words"], data["max_words"] = spec.min_words, spec.max_words
        if spec.show_sample and spec.sample_answer.strip():
            key["sample_html"] = r.block(spec.sample_answer)
    elif q.type == "code":
        data["language"], data["starter"] = spec.language, spec.starter
        if spec.show_reference and spec.reference.strip():
            key["reference_html"] = code_block(spec.reference, spec.language)
    return data, key


def _katex_assets() -> tuple[str, str, str]:
    """(css with woff2 fonts inlined, katex js, auto-render js)."""
    root = PKG / "vendor" / "katex"
    css = (root / "katex.min.css").read_text(encoding="utf-8")
    css = _FONT_FALLBACK_RE.sub("", css)

    def font(m: re.Match) -> str:
        b64 = base64.b64encode((root / m.group(1)).read_bytes()).decode("ascii")
        return f'url(data:font/woff2;base64,{b64}) format("woff2")'

    css = _FONT_URL_RE.sub(font, css)
    return (
        css,
        (root / "katex.min.js").read_text(encoding="utf-8"),
        (root / "contrib" / "auto-render.min.js").read_text(encoding="utf-8"),
    )


def _json_for_script(obj) -> str:
    s = json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
    # JSON.parse restores "<"; no "</script" or "<!--" can survive in the page
    return s.replace("<", "\\u003c")


def build_html(quiz: Quiz, base_dir: Path) -> BuildResult:
    r = Renderer(base_dir)
    questions, key = [], {}
    for q in quiz.questions:
        d, k = _question_data(q, quiz, r)
        questions.append(d)
        key[q.id] = k

    meta = quiz.meta
    time_limit = meta.time_limit_seconds
    override = os.environ.get("FULLMARK_TEST_TIME_LIMIT")  # test-only
    if override:
        time_limit = parse_duration(override)

    data = {
        "format": "fullmark",
        "title": meta.title,
        "description_html": r.fragment(meta.description) if meta.description else "",
        "id": quiz.id,
        "hash": quiz.source_hash,
        "source_file": quiz.source_file,
        "fullmark_version": __version__,
        "built_at": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "time_limit": time_limit,
        "on_timeout": meta.on_timeout,
        "feedback": meta.feedback,
        "mode": meta.mode,
        "review": meta.review,
        "theme": meta.theme,
        "shuffle_questions": meta.shuffle_questions,
        "pass_mark": meta.pass_mark,
        "bank": {"pick": meta.pick} if quiz.has_bank else None,
        "tags": meta.tags,
        "total_points": quiz.total_points,
        "preamble_html": r.block(quiz.preamble_md),
        "sections": [
            {
                "title": s.title,
                "time": s.time,
                "seconds": parse_duration(s.time) if s.time else None,
                "pick": s.pick,
                "intro_html": r.block(s.intro_md),
            }
            for s in quiz.sections
        ],
        "questions": questions,
    }
    key_blob = obfuscate(key, quiz.source_hash)

    katex_css = katex_js = auto_js = ""
    if r.has_math:
        katex_css, katex_js, auto_js = _katex_assets()
        for js in (katex_js, auto_js):
            assert "</script" not in js.lower()

    css = (PKG / "static" / "quiz.css").read_text(encoding="utf-8")
    js = (PKG / "static" / "quiz.js").read_text(encoding="utf-8")
    env = Environment(
        loader=FileSystemLoader(PKG / "templates"),
        undefined=StrictUndefined,
        autoescape=False,
    )
    out = env.get_template("quiz.html.j2").render(
        title=meta.title.replace("<", "&lt;"),
        theme=meta.theme,
        theme_css=theme_css(),
        pygments_css=pygments_css(),
        css=css,
        js=js,
        data_json=_json_for_script(data),
        key_blob=key_blob,
        has_math=r.has_math,
        katex_css=katex_css,
        katex_js=katex_js,
        auto_js=auto_js,
    )
    size = len(out.encode("utf-8"))
    result = BuildResult(html=out, size=size, has_math=r.has_math)
    if size > MAX_BYTES:
        result.errors.append(
            f"output is {size / 1e6:.1f} MB; the limit is {MAX_BYTES // 1_000_000} MB"
        )
    elif size > WARN_BYTES:
        result.warnings.append(
            f"output is {size / 1e6:.1f} MB (over {WARN_BYTES // 1_000_000} MB); consider smaller media"
        )
    return result
