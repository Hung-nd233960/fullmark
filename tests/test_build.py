import json
import re
from pathlib import Path

import pytest

from fullmark.build import build_html, deobfuscate, obfuscate
from fullmark.cli import main
from fullmark.theme import DARK, LIGHT, theme_css
from fullmark.validate import load_quiz

HERE = Path(__file__).parent
FIX = HERE / "fixtures"
STATIC = HERE.parent / "src" / "fullmark" / "static"


def build(path: Path):
    quiz, findings, _ = load_quiz(path)
    assert not findings.has_errors, [f.format() for f in findings]
    return quiz, build_html(quiz, path.parent)


@pytest.fixture(scope="module")
def kitchen():
    return build(FIX / "all-types.md")


def page_data(html: str) -> dict:
    m = re.search(
        r'<script type="application/json" id="quiz-data">(.*?)</script>',
        html,
        re.DOTALL,
    )
    return json.loads(m.group(1).replace("<\\/", "</").replace("<\\!--", "<!--"))


def test_single_file_no_external_references(kitchen):
    _, r = kitchen
    html = r.html
    assert not re.search(r'(?:src|href)="https?:', html)
    assert "<link " not in html
    assert re.search(r"<script[^>]+\bsrc=", html) is None
    assert "url(fonts/" not in html  # KaTeX fonts are inlined
    assert "data:font/woff2;base64," in html


def test_csp_meta(kitchen):
    html = kitchen[1].html
    csp = re.search(r'Content-Security-Policy" content="([^"]+)"', html).group(1)
    assert csp == (
        "default-src 'none'; img-src data:; media-src data:; font-src data:; "
        "style-src 'unsafe-inline'; script-src 'unsafe-inline'"
    )


def test_embedded_data_and_key(kitchen):
    quiz, r = kitchen
    data = page_data(r.html)
    assert data["hash"] == quiz.source_hash and len(data["hash"]) == 16
    assert data["id"] == "all-types" and data["time_limit"] == 1200
    assert [q["id"] for q in data["questions"]][:2] == ["single1", "multi1"]
    # no answers in the public data
    blob = json.dumps(data)
    assert '"correct"' not in blob and "explanation" not in blob
    key_blob = re.search(r'id="quiz-key">(.*?)</script>', r.html, re.DOTALL).group(1)
    key = deobfuscate(key_blob, quiz.source_hash)
    assert key["single1"]["spec"]["correct"] == 1
    assert "Delayed-rectifier" in key["single1"]["explanation_html"]
    assert key["code1"]["reference_html"].startswith('<pre class="qm-code">')
    # the plain key text is not readable in the page
    assert "Delayed-rectifier" not in r.html


def test_obfuscate_roundtrip_unicode():
    payload = {"a": ["Na⁺", "é", "日本"], "n": 1.5}
    assert (
        deobfuscate(obfuscate(payload, "3f9c2a1b7d4e5f60"), "3f9c2a1b7d4e5f60")
        == payload
    )
    assert obfuscate(payload, "3f9c2a1b7d4e5f60") != obfuscate(
        payload, "0000000000000001"
    )


def test_media_embedded_as_data_uris(kitchen):
    html = kitchen[1].html
    assert "data:image/png;base64," in html
    assert re.search(
        r"<audio controls[^>]+src=\\?\"data:audio/wav;base64,",
        page_data(html)["sections"][2]["intro_html"],
    )


def test_blanks_render_as_inputs_in_prompt_and_code(kitchen):
    data = page_data(kitchen[1].html)
    q = {x["id"]: x for x in data["questions"]}
    assert (
        q["blanks1"]["n_blanks"] == 2
        and q["blanks1"]["prompt_html"].count('class="qm-blank qm-blank-m"') == 2
    )
    code = q["blanks2"]["prompt_html"]
    assert (
        'class="qm-code"' in code
        and 'class="qm-blank qm-blank-s"' in code
        and "QZBLANK" not in code
    )
    assert '<span class="k">' in code or '<span class="kd">' in code  # Pygments classes


def test_math_markers_and_katex_included(kitchen):
    _, r = kitchen
    assert r.has_math
    data = page_data(r.html)
    assert 'class="qm-math"' in data["sections"][0]["intro_html"]
    display = next(q for q in data["questions"] if q["id"] == "num1")["prompt_html"]
    assert 'class="qm-math qm-display"' in display and r"\[" in display
    assert "renderMathInElement" in r.html and ".katex" in r.html


def test_no_math_means_no_katex(tmp_path):
    p = tmp_path / "plain.md"
    p.write_text(
        "---\ntitle: P\n---\n\n## Q\n\nCosts $5 or $6.\n\n- [x] a\n- [ ] b\n\n> [!explanation]\n> ok\n",
        encoding="utf-8",
    )
    _, r = build(p)
    assert not r.has_math
    assert ".katex" not in r.html and "katex" not in r.html.lower()
    assert "\\(" not in page_data(r.html)["questions"][0]["title_html"]


def test_test_time_limit_override(tmp_path, monkeypatch):
    monkeypatch.setenv("FULLMARK_TEST_TIME_LIMIT", "10s")
    _, r = build(FIX / "all-types.md")
    assert page_data(r.html)["time_limit"] == 10


def test_script_breakout_is_escaped(tmp_path):
    p = tmp_path / "x.md"
    p.write_text(
        "---\ntitle: T\n---\n\n## Evil </script><script>alert(1)</script>\n\n- [x] a\n- [ ] b\n",
        encoding="utf-8",
    )
    _, r = build(p)
    assert "</script><script>alert(1)" not in r.html
    assert (
        r.html.count("<script") == 4
    )  # theme init, data, key, runtime (no math scripts)


def test_cli_build_and_refusal(tmp_path, capsys):
    out = tmp_path / "out.html"
    assert main(["build", str(FIX / "all-types.md"), "-o", str(out)]) == 0
    assert out.stat().st_size > 100_000 and "wrote" in capsys.readouterr().out
    assert (
        main(
            [
                "build",
                str(FIX / "invalid" / "unknown-type.md"),
                "-o",
                str(tmp_path / "bad.html"),
            ]
        )
        == 1
    )
    assert not (tmp_path / "bad.html").exists()


# ---------------------------------------------------------------- palette


def _lum(hex_color: str) -> float:
    rgb = [int(hex_color[i : i + 2], 16) / 255 for i in (1, 3, 5)]
    lin = [c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4 for c in rgb]
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]


def contrast(a: str, b: str) -> float:
    hi, lo = sorted((_lum(a), _lum(b)), reverse=True)
    return (hi + 0.05) / (lo + 0.05)


SURFACES = ("bg", "surface", "card", "sunken")


def test_palette_is_muted_and_complete():
    assert len(LIGHT) == len(DARK) < 22
    assert set(LIGHT) == set(DARK)
    for key in (
        *SURFACES,
        "line",
        "line-strong",
        "text",
        "muted",
        "accent",
        "on-accent",
    ):
        assert key in LIGHT
    for pal in (LIGHT, DARK):  # toned down: no fully saturated accent
        for name in ("accent", "bad", "ok", "info", "orange", "flag", "warn", "hint"):
            r, g, b = (int(pal[name][i : i + 2], 16) / 255 for i in (1, 3, 5))
            sat = (max(r, g, b) - min(r, g, b)) / max(max(r, g, b), 1e-9)
            assert sat < 0.7, (name, pal[name])


@pytest.mark.parametrize("theme,pal", [("light", LIGHT), ("dark", DARK)])
def test_text_contrast_aa(theme, pal):
    for surface in SURFACES:
        assert contrast(pal["text"], pal[surface]) >= 4.5, surface
        assert contrast(pal["muted"], pal[surface]) >= 4.5, f"muted on {surface}"
    assert contrast(pal["on-accent"], pal["accent"]) >= 4.5
    # the accent also colours links and headings on the page and card
    for surface in ("bg", "card"):
        assert contrast(pal["accent"], pal[surface]) >= 4.5, f"accent on {surface}"
    # cards sit above the page: lighter in both themes
    assert _lum(pal["card"]) > _lum(pal["bg"]) > _lum(pal["sunken"])


def test_css_uses_variables_only():
    css = (STATIC / "quiz.css").read_text(encoding="utf-8")
    assert not re.search(r"#[0-9a-fA-F]{3,8}\b", css), (
        "color literals belong in theme.py"
    )
    assert not re.search(r"\brgba?\(|\bhsla?\(", css)
    used = set(re.findall(r"var\(--([\w-]+)", css))
    defined = set(LIGHT) | {"st", "qm-scale", "qm-header-h"}  # the last two are lengths
    assert used <= defined, used - defined


def test_theme_css_has_both_themes():
    css = theme_css()
    assert ':root[data-theme="light"]' in css and ':root[data-theme="dark"]' in css
    assert f"--bg: {LIGHT['bg']}" in css and f"--bg: {DARK['bg']}" in css


def test_pygments_uses_theme_colors(kitchen):
    html = kitchen[1].html
    assert (
        ':root[data-theme="light"] .highlight' in html
        and ':root[data-theme="dark"] .highlight' in html
    )
    assert LIGHT["accent"] in html and DARK["accent"] in html  # keywords
    assert LIGHT["ok"] in html and DARK["ok"] in html  # strings
