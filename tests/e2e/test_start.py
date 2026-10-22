"""The start screen: the cover sheet, Focus mode and when the attempt would end. Real Chromium."""

import re

import pytest
from conftest import build_to
from test_panel import stub

SECTIONS = """---
title: Cover sheet
---

# Warm-up {time=10m}

## One?

- [x] yes
- [ ] no

# Main part {time=5m}

## Two?

- [x] yes
- [ ] no

## Three?

- [x] yes
- [ ] no
"""

TIMED = """---
title: Timed
time_limit: 30m
---

## Only?

- [x] yes
- [ ] no
"""

NUMBERED = SECTIONS.replace("# Warm-up", "# 1. Warm-up").replace(
    "# Main part", "# 2. Main part"
)

PLAIN = """---
title: Plain
---

## Only?

- [x] yes
- [ ] no
"""


@pytest.fixture(scope="module")
def pages(tmp_path_factory):
    tmp = tmp_path_factory.mktemp("start")
    out = {}
    for name, text in (
        ("sections", SECTIONS),
        ("timed", TIMED),
        ("numbered", NUMBERED),
        ("plain", PLAIN),
    ):
        src = tmp / f"{name}.md"
        src.write_text(text, encoding="utf-8")
        out[name] = build_to(tmp, src)
    return out


def open_start(browser, html, init=None):
    ctx = browser.new_context(viewport={"width": 1280, "height": 900})
    pg = ctx.new_page()
    pg.errors = []
    pg.on("pageerror", lambda e: pg.errors.append(str(e)))
    if init:
        pg.add_init_script(init)
    pg.goto(html.as_uri())
    pg.wait_for_selector("#start-screen")
    return ctx, pg


def clock_in(pg, minutes):
    """The page's own formatting of now + minutes, as the start screen prints it."""
    return pg.evaluate(
        "m => new Date(Date.now() + m * 60000)"
        ".toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})",
        minutes,
    )


def test_cover_sheet_lists_the_facts_and_the_sections(browser, pages):
    ctx, pg = open_start(browser, pages["sections"], stub(True, False))
    facts = pg.locator(".qm-facts dt").all_text_contents()
    assert facts == ["Questions", "Points", "Time allowed", "Feedback"]
    assert pg.locator(".qm-facts dd").all_text_contents()[:3] == ["3", "3", "No limit"]
    rows = pg.locator(".qm-contents li")
    assert rows.count() == 2
    assert rows.nth(0).inner_text().split("\n")[0] == "1"
    assert (
        "Warm-up" in rows.nth(0).inner_text() and "10 min" in rows.nth(0).inner_text()
    )
    assert pg.locator(".qm-contents-total").inner_text().endswith("15 min")
    eta = pg.locator("#eta").inner_text()
    assert eta.startswith(
        "At the suggested pace, starting now, you would finish around "
    )
    assert clock_in(pg, 15) in eta or clock_in(pg, 16) in eta
    assert pg.locator("#display-btn").inner_text() == "Text size and theme"
    assert not pg.errors
    ctx.close()


def test_a_time_limit_says_when_time_runs_out(browser, pages):
    ctx, pg = open_start(browser, pages["timed"], stub(True, False))
    assert pg.locator(".qm-facts dd").nth(2).inner_text() == "30 min"
    eta = pg.locator("#eta").inner_text()
    assert eta.startswith("Start now and time runs out at ")
    assert clock_in(pg, 30) in eta or clock_in(pg, 31) in eta
    assert pg.locator(".qm-contents").count() == 0  # no sections, no list
    # resuming keeps the end time of the attempt already running
    pg.click("#start-btn")
    pg.wait_for_selector("#quiz-screen .qm-card")
    pg.reload()
    pg.wait_for_selector("#resume-btn")
    eta = pg.locator("#eta").inner_text()
    assert re.match(r"^Time runs out at .+ \((29|30) min left\)\.$", eta), eta
    assert not pg.errors
    ctx.close()


def test_titles_with_their_own_numbers_are_not_numbered_twice(browser, pages):
    ctx, pg = open_start(browser, pages["numbered"])
    assert pg.locator(".qm-contents .qm-sec-num").count() == 0
    assert pg.locator(".qm-contents li").first.inner_text().startswith("1. Warm-up")
    ctx.close()


def test_focus_switch_enters_focus_mode_on_start_and_is_remembered(browser, pages):
    ctx, pg = open_start(browser, pages["plain"], stub(True, False))
    switch = pg.locator("#focus-switch")
    assert switch.get_attribute("role") == "switch" and not switch.is_checked()
    pg.click("label[for=focus-switch]")
    assert switch.is_checked()
    pg.click("#start-btn")
    pg.wait_for_selector("body.qm-focus")
    assert pg.locator("#focus-btn").get_attribute("aria-pressed") == "true"
    other = ctx.new_page()
    other.add_init_script(stub(True, False))
    other.goto(pages["sections"].as_uri())
    other.wait_for_selector("#focus-switch")
    assert other.locator("#focus-switch").is_checked()
    ctx.close()


def test_serve_focus_turns_the_switch_on(browser, pages):
    init = stub(True, False) + "window.FULLMARK_SUBMIT = {focus: true};"
    ctx, pg = open_start(browser, pages["plain"], init)
    assert pg.locator("#focus-switch").is_checked()
    ctx.close()


def test_without_fullscreen_or_times_there_is_no_ready_box(browser, pages):
    ctx, pg = open_start(browser, pages["plain"], stub(False, False))
    assert pg.locator("#focus-switch").count() == 0
    assert pg.locator(".qm-ready").count() == 0
    pg.click("#start-btn")
    pg.wait_for_selector("#quiz-screen .qm-card")
    assert pg.locator("#display-btn").inner_text() == "Aa"
    assert not pg.errors
    ctx.close()
