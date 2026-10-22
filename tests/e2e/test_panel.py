"""The progress panel (wide screens), pill states and Focus mode. Real Chromium, file:// URLs."""

import re
from pathlib import Path

import pytest
from conftest import FIX, build_to
from helpers import correct_response, fill, wrong_response

from fullmark.validate import load_quiz

FULLSCREEN_STUB = """
(() => {
  let el = null;
  const enabled = %s;
  const refuse = %s;
  Object.defineProperty(document, "fullscreenEnabled", { get: () => enabled, configurable: true });
  Object.defineProperty(document, "fullscreenElement", { get: () => el, configurable: true });
  Element.prototype.requestFullscreen = function () {
    if (refuse) return Promise.reject(new Error("refused"));
    el = this;
    document.dispatchEvent(new Event("fullscreenchange"));
    return Promise.resolve();
  };
  document.exitFullscreen = function () {
    el = null;
    document.dispatchEvent(new Event("fullscreenchange"));
    return Promise.resolve();
  };
})();
"""


def stub(enabled: bool, refuse: bool) -> str:
    return FULLSCREEN_STUB % (str(enabled).lower(), str(refuse).lower())


def open_quiz(browser, html: Path, width=1280, height=800, init=None):
    ctx = browser.new_context(viewport={"width": width, "height": height})
    pg = ctx.new_page()
    pg.errors = []
    pg.on("pageerror", lambda e: pg.errors.append(str(e)))
    if init:
        pg.add_init_script(init)
    pg.goto(html.as_uri())
    pg.click("#start-btn")
    pg.wait_for_selector("#quiz-screen .qm-card")
    return ctx, pg


def submit(pg):
    pg.click("#submit-btn")
    pg.click("#dlg-ok")
    pg.wait_for_selector("#results")


@pytest.fixture(scope="module")
def long_html(tmp_path_factory):
    tmp = tmp_path_factory.mktemp("longpanel")
    body = "".join(
        f"## Question {i}? {{id=q{i}}}\n\n- [x] yes\n- [ ] no\n\n" for i in range(1, 61)
    )
    src = tmp / "long.md"
    src.write_text("---\ntitle: Long\n---\n\n" + body, encoding="utf-8")
    return build_to(tmp, src)


def test_wide_layout_has_a_panel_beside_the_questions(browser, kitchen_html):
    quiz, _, _ = load_quiz(FIX / "all-types.md")
    assert quiz is not None
    ctx, pg = open_quiz(browser, kitchen_html)
    panel = pg.locator("aside.qm-panel")
    assert panel.get_attribute("aria-label") == "Progress"
    p, card = panel.bounding_box(), pg.locator(".qm-card").first.bounding_box()
    assert p["x"] >= card["x"] + card["width"]
    cols = pg.locator(".qm-panel .qm-nav").evaluate(
        "e => getComputedStyle(e).gridTemplateColumns"
    )
    assert len(cols.split()) == 5
    assert pg.locator(".qm-header .qm-pill").count() == 0
    assert pg.locator(".qm-panel .qm-pill").count() == len(quiz.questions)
    assert pg.locator(".qm-header #progress, .qm-header #timer").count() == 0
    assert pg.locator(".qm-panel #progress").text_content() == "Answered 0/12"
    assert pg.locator(".qm-panel-pct").text_content() == "0%"
    bar = pg.locator("[role=progressbar]")
    assert bar.get_attribute("aria-valuenow") == "0"
    assert bar.get_attribute("aria-valuemax") == "12"
    for q in quiz.questions[:3]:
        fill(pg, q, correct_response(q, quiz))
    assert pg.locator("#progress").text_content() == "Answered 3/12"
    assert pg.locator(".qm-panel-pct").text_content() == "25%"
    assert bar.get_attribute("aria-valuenow") == "3"
    assert pg.locator(".qm-pill.answered").count() == 3
    assert pg.locator("#panel-score").is_hidden()
    assert pg.evaluate("document.documentElement.scrollWidth") <= 1280
    assert not pg.errors, pg.errors
    ctx.close()


def test_after_submit_score_line_and_pill_states(browser, kitchen_html):
    quiz, _, _ = load_quiz(FIX / "all-types.md")
    assert quiz is not None
    ctx, pg = open_quiz(browser, kitchen_html)
    qs = quiz.questions
    essay = next(q for q in qs if q.type == "essay")
    for q in qs[:3]:
        fill(pg, q, correct_response(q, quiz))
    for q in qs[3:5]:
        fill(pg, q, wrong_response(q, quiz))
    fill(pg, essay, correct_response(essay, quiz))
    pg.locator(f"#card-{qs[0].id} .qm-flag input").check()
    submit(pg)
    exp = pg.evaluate("window.fullmark.buildExport()")["score"]
    line = pg.locator("#panel-score")
    assert line.is_visible()
    assert (
        line.text_content()
        == f"Score {exp['earned']:g}/{exp['possible_auto']:g} pts · {exp['percent_auto']:g}%"
    )
    pills = pg.locator(".qm-panel .qm-pill")
    assert pills.nth(0).get_attribute("data-sym") == "✓"
    assert (
        pills.nth(0).get_attribute("aria-label") == "Go to question 1, correct, flagged"
    )
    assert pills.nth(1).get_attribute("aria-label") == "Go to question 2, correct"
    wrong = pills.nth(3)
    assert wrong.get_attribute("data-sym") == "✗"
    assert wrong.get_attribute("aria-label") == "Go to question 4, wrong"
    idx = qs.index(essay)
    assert pills.nth(idx).get_attribute("data-sym") == "?"
    assert pills.nth(idx).get_attribute("aria-label").endswith("waiting for AI grading")
    blank = next(i for i, q in enumerate(qs) if i > 5 and q is not essay)
    assert pills.nth(blank).get_attribute("data-sym") == "–"
    assert pills.nth(blank).get_attribute("aria-label").endswith("not answered")
    legend = pg.locator(".qm-legend").text_content()
    assert (
        "Correct" in legend and "Wrong" in legend and "Waiting for AI grading" in legend
    )
    ctx.close()


def test_survey_panel_has_no_score(browser, tmp_path):
    html = build_to(tmp_path, FIX / "survey.md")
    ctx, pg = open_quiz(browser, html)
    assert pg.locator(".qm-panel #progress").count() == 1
    submit(pg)
    assert pg.locator("#panel-score").is_hidden()
    assert "Score" not in pg.locator(".qm-panel").inner_text()
    # nothing is right or wrong; unanswered pills only carry a dash
    syms = pg.locator(".qm-pill").evaluate_all(
        "els => els.map(e => e.dataset.sym || '')"
    )
    assert set(syms) <= {"", "–"}
    ctx.close()


def test_narrow_screen_keeps_progress_and_pills_in_the_header(browser, kitchen_html):
    ctx, pg = open_quiz(browser, kitchen_html, 400, 800)
    assert pg.locator("aside.qm-panel").is_hidden()
    assert pg.locator(".qm-header #progress").count() == 1
    assert pg.locator(".qm-header #timer").count() == 1
    assert pg.locator(".qm-header .qm-nav .qm-pill").count() == 12
    assert pg.locator("#progress").is_visible()
    assert pg.evaluate("document.documentElement.scrollWidth") <= 400
    # crossing the breakpoint moves the same elements, with no duplicate ids
    pg.set_viewport_size({"width": 1280, "height": 800})
    # The move runs on the media query's change event, which fires after the resize.
    pg.wait_for_selector(".qm-panel #progress", state="attached")
    assert pg.locator(".qm-panel #progress").count() == 1
    assert pg.locator(".qm-header .qm-pill").count() == 0
    assert pg.locator("[id=progress]").count() == 1
    assert pg.locator("[id=timer]").count() == 1
    assert pg.locator("[aria-current='true']").count() == 1
    ctx.close()


def test_panel_scrolls_and_keeps_the_current_pill_in_view(browser, long_html):
    ctx, pg = open_quiz(browser, long_html, 1280, 500)
    panel = pg.locator(".qm-panel")
    assert panel.evaluate("e => e.scrollHeight > e.clientHeight")
    assert panel.evaluate("e => getComputedStyle(e).overflowY") in ("auto", "scroll")
    pg.locator(".qm-panel .qm-pill", has_text=re.compile(r"^45$")).click()
    pg.wait_for_function(
        "() => document.querySelector(\"[aria-current='true']\")?.textContent === '45'"
    )
    pg.wait_for_timeout(900)  # the panel scrolls smoothly
    pill = pg.locator(".qm-pill[aria-current='true']")
    assert pill.count() == 1
    box, area = pill.bounding_box(), panel.bounding_box()
    assert area["y"] <= box["y"]
    assert box["y"] + box["height"] <= area["y"] + area["height"] + 1
    assert pg.locator(".qm-header").bounding_box()["height"] <= 500 * 0.3
    ctx.close()


def test_focus_mode_hides_chrome_and_shows_a_clock(browser, kitchen_html):
    ctx, pg = open_quiz(browser, kitchen_html, init=stub(True, False))
    btn = pg.locator("#focus-btn")
    assert btn.is_visible() and btn.get_attribute("aria-pressed") == "false"
    assert pg.locator("#clock").is_hidden()
    assert pg.locator("#export-btn").is_visible()
    assert pg.locator(".qm-aa").is_visible()
    btn.click()
    pg.wait_for_function("document.body.classList.contains('qm-focus')")
    assert btn.get_attribute("aria-pressed") == "true"
    for sel in (".qm-aa", "#display-btn", "#export-btn"):
        assert pg.locator(sel).is_hidden(), sel
    assert pg.locator("#submit-btn").is_visible()
    assert pg.locator(".qm-panel").is_visible()
    clock = pg.locator("#clock")
    assert re.match(r"^\d{1,2}:\d{2}", clock.text_content())
    assert clock.get_attribute("aria-label") == "Time"
    assert clock.get_attribute("aria-live") is None
    assert pg.locator(".qm-panel #clock").count() == 1
    btn.click()
    pg.wait_for_function("!document.body.classList.contains('qm-focus')")
    assert btn.get_attribute("aria-pressed") == "false"
    assert pg.locator("#clock").is_hidden()
    assert pg.locator("#export-btn").is_visible()
    # on a narrow screen the clock sits in the header
    pg.set_viewport_size({"width": 400, "height": 800})
    pg.wait_for_selector(
        ".qm-header #progress", state="attached"
    )  # moved on the change event
    btn.click()
    pg.wait_for_function("document.body.classList.contains('qm-focus')")
    assert pg.locator(".qm-header #clock").is_visible()
    assert not pg.errors, pg.errors
    ctx.close()


def test_focus_mode_stays_off_when_fullscreen_is_refused(browser, kitchen_html):
    ctx, pg = open_quiz(browser, kitchen_html, init=stub(True, True))
    pg.click("#focus-btn")
    pg.wait_for_timeout(200)
    assert not pg.evaluate("document.body.classList.contains('qm-focus')")
    assert pg.locator("#focus-btn").get_attribute("aria-pressed") == "false"
    ctx.close()


def test_focus_button_is_hidden_without_fullscreen_support(browser, kitchen_html):
    ctx, pg = open_quiz(browser, kitchen_html, init=stub(False, False))
    assert pg.locator("#focus-btn").is_hidden()
    ctx.close()


def test_legend_is_collapsible_and_remembered(browser, kitchen_html):
    ctx, pg = open_quiz(browser, kitchen_html)
    box = pg.locator(".qm-legend-box")
    assert box.evaluate("e => e.open") and pg.locator(".qm-legend").is_visible()
    pg.click(".qm-legend-box > summary")
    assert pg.locator(".qm-legend").is_hidden()
    pg.wait_for_function("() => localStorage.getItem('fullmark:legend') === 'closed'")
    pg.reload()
    pg.click("#resume-btn, #start-btn")
    assert pg.locator(".qm-legend").is_hidden()
    pg.click(".qm-legend-box > summary")
    assert pg.locator(".qm-legend").is_visible()
    ctx.close()
