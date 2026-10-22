from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

from fullmark.build import build_html
from fullmark.validate import load_quiz

FIX = Path(__file__).parent.parent / "fixtures"


@pytest.fixture(scope="session")
def browser():
    with sync_playwright() as p:
        b = p.chromium.launch()
        yield b
        b.close()


def build_to(tmp: Path, source: Path, name: str | None = None) -> Path:
    quiz, findings, _ = load_quiz(source)
    assert not findings.has_errors, [f.format() for f in findings]
    out = tmp / (name or source.stem + ".html")
    out.write_text(build_html(quiz, source.parent).html, encoding="utf-8")
    return out


@pytest.fixture(scope="session")
def kitchen_html(tmp_path_factory) -> Path:
    return build_to(tmp_path_factory.mktemp("kitchen"), FIX / "all-types.md")


@pytest.fixture
def page(browser):
    ctx = browser.new_context(
        accept_downloads=True, viewport={"width": 1000, "height": 900}
    )
    pg = ctx.new_page()
    pg.errors = []
    pg.on("pageerror", lambda e: pg.errors.append(str(e)))
    pg.on("console", lambda m: pg.errors.append(m.text) if m.type == "error" else None)
    yield pg
    ctx.close()
