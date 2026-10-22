"""End-to-end acceptance tests (SPEC section 15). Real Chromium, file:// URLs only."""

import json
import re
from pathlib import Path

import pytest
from conftest import FIX, build_to
from helpers import correct_response, fill, validate_results, wrong_response

from fullmark.cli import main
from fullmark.grading import score_attempt
from fullmark.validate import load_quiz

ROOT = Path(__file__).parent.parent.parent
EXAMPLES = ROOT / "src" / "fullmark" / "examples"


def open_display(pg):
    """Open the "Aa" display menu (text size and theme) if it is closed."""
    if pg.get_attribute("#display-btn", "aria-expanded") != "true":
        pg.click("#display-btn")


@pytest.fixture(scope="session")
def calculus_html(tmp_path_factory):
    return build_to(tmp_path_factory.mktemp("calc"), EXAMPLES / "calculus-1.md")


@pytest.fixture(scope="session")
def rust_html(tmp_path_factory):
    return build_to(tmp_path_factory.mktemp("rust"), EXAMPLES / "rust-basics.md")


@pytest.fixture(scope="session")
def ielts_html(tmp_path_factory):
    mp = pytest.MonkeyPatch()
    mp.setenv("FULLMARK_TEST_TIME_LIMIT", "10s")
    try:
        return build_to(tmp_path_factory.mktemp("ielts"), EXAMPLES / "ielts-writing.md")
    finally:
        mp.undo()


def start(page, html: Path):
    page.goto(html.as_uri())
    page.click("#start-btn")
    page.wait_for_selector("#quiz-screen .qm-card")


def export_json(page) -> dict:
    exported = page.evaluate("window.fullmark.buildExport()")
    validate_results(exported)
    return exported


def grade_cli(tmp_path, export: dict, source: Path, capsys) -> tuple[str, str]:
    """Run `quiz grade` on an export; returns (report text, stderr)."""
    res = tmp_path / "results.json"
    res.write_text(json.dumps(export), encoding="utf-8")
    out = tmp_path / "report.md"
    capsys.readouterr()
    assert main(["grade", str(res), "--quiz", str(source), "-o", str(out)]) == 0
    return out.read_text(encoding="utf-8"), capsys.readouterr().err


# ---------------------------------------------------------------- layout


def test_check_button_has_space_above_it(page, calculus_html):
    """The Check button must not sit flush against the answer control."""
    start(page, calculus_html)
    cards = page.locator(".qm-card:has(.qm-check)")
    assert cards.count() > 0
    for i in range(cards.count()):
        card = cards.nth(i)
        # nearest visible content above the button (blanks questions have an empty answer box)
        above = card.locator(".qm-check").evaluate(
            """el => {
              let n = el.closest('.qm-actions').previousElementSibling;
              while (n && n.getBoundingClientRect().height === 0) n = n.previousElementSibling;
              return n.getBoundingClientRect().bottom;
            }"""
        )
        gap = card.locator(".qm-check").bounding_box()["y"] - above
        assert gap >= 8, f"card {i}: Check is only {gap:.1f}px below the content"


# ---------------------------------------------------------------- calculus


def test_calculus_instant_feedback_and_score(page, calculus_html, tmp_path, capsys):
    src = EXAMPLES / "calculus-1.md"
    quiz, _, _ = load_quiz(src)
    start(page, calculus_html)

    # KaTeX rendered, no raw delimiters left, image visible
    assert page.locator(".katex").count() > 20
    text = page.locator("#quiz-screen").text_content()
    assert "$" not in text and "\\(" not in text and "\\[" not in text
    img = page.locator("img.qm-img").first
    assert img.is_visible() and img.evaluate("e => e.naturalWidth") > 100

    auto = [q for q in quiz.questions if q.auto]
    expected = {}
    for n, q in enumerate(auto):
        right = n % 2 == 0
        fill(page, q, correct_response(q, quiz) if right else wrong_response(q, quiz))
        page.locator(f"#card-{q.id} .qm-check").click()
        expected[q.id] = "st-correct" if right else "st-incorrect"
    for q in auto:
        card = page.locator(f"#card-{q.id}")
        assert expected[q.id] in card.get_attribute("class"), q.id
        assert card.locator(".qm-feedback .qm-badge").count() == 1
        assert card.locator(".qm-explain").text_content().strip(), q.id
        assert all(
            el.is_disabled()
            for el in card.locator("input:not([aria-label^='Flag'])").all()
        ), q.id
    # a wrong answer reveals the correct one (choice questions highlight the row instead)
    revealed = 0
    for q in auto:
        card = page.locator(f"#card-{q.id}")
        if expected[q.id] == "st-incorrect" and q.type not in ("single", "multi"):
            assert (
                card.locator(".qm-correct-answer")
                .text_content()
                .strip()
                .startswith("Correct answer:")
            ), q.id
            revealed += 1
        if expected[q.id] == "st-incorrect" and q.type in ("single", "multi"):
            assert (
                card.locator(".qm-choice.ok").count() >= 1
                and card.locator(".qm-choice.bad").count() >= 1
            ), q.id
    assert revealed >= 2

    # essay: pending; then submit and compare with the Python re-grade
    essay = next(q for q in quiz.questions if q.type == "essay")
    page.locator(f"#card-{essay.id} textarea").fill(
        "The mean value theorem says " + "word " * 70
    )
    page.click("#submit-btn")
    page.click("#dlg-ok")
    page.wait_for_selector("#results")
    exported = export_json(page)
    answers = page.evaluate("window.fullmark.state().answers")
    py = score_attempt(quiz, answers)
    s = exported["score"]
    for key in (
        "earned",
        "possible_auto",
        "pending_points",
        "possible_total",
        "percent_auto",
        "passed",
    ):
        assert s[key] == py["score"][key], key
    for eq in exported["questions"]:
        assert eq["status"] == py["per_question"][eq["id"]]["status"], eq["id"]
    assert page.locator(f"#card-{essay.id}.st-pending").count() == 1
    assert (
        str(s["percent_auto"]).rstrip("0").rstrip(".")
        in page.locator("#results .qm-score").text_content()
    )
    assert not page.errors

    report, err = grade_cli(tmp_path, exported, src, capsys)
    assert "Python grades" not in err and "browser said" not in err
    assert f"{s['percent_auto']:g}%" in report


# ---------------------------------------------------------------- rust


def test_rust_highlighting_blanks_shuffle_code_and_export(
    page, rust_html, tmp_path, capsys
):
    src = EXAMPLES / "rust-basics.md"
    quiz, _, _ = load_quiz(src)
    start(page, rust_html)

    # highlighted code (Pygments classes), blanks are inputs inside the code block
    assert (
        page.locator(
            "pre.qm-code .highlight span, pre.qm-code code.highlight span"
        ).count()
        > 20
    )
    assert (
        page.locator(
            "pre.qm-code span.k, pre.qm-code span.kd, pre.qm-code span.nf"
        ).count()
        > 3
    )
    blanks_card = next(q for q in quiz.questions if q.type == "blanks")
    assert (
        page.locator(f"#card-{blanks_card.id} pre.qm-code input.qm-blank").count() == 2
    )
    assert "QZBLANK" not in page.content()

    # choices shuffle, but the export always uses original indices
    orders = {}
    for q in quiz.questions:
        if q.type in ("single", "multi"):
            orders[q.id] = page.locator(
                f"#card-{q.id} input[name='c-{q.id}']"
            ).evaluate_all("els => els.map(e => Number(e.value))")
            assert sorted(orders[q.id]) == list(range(len(q.choices)))
    assert any(o != sorted(o) for o in orders.values()), "no question was shuffled"
    page.evaluate("window.dispatchEvent(new Event('pagehide'))")
    page.reload()
    page.click("#resume-btn")
    for qid, o in orders.items():
        again = page.locator(f"#card-{qid} input[name='c-{qid}']").evaluate_all(
            "els => els.map(e => Number(e.value))"
        )
        assert again == o, "a reload must keep the shuffled order"

    answers = {}
    for q in quiz.questions:
        if q.type == "code":
            continue
        r = correct_response(q, quiz)
        fill(page, q, r)
        answers[q.id] = r
    exported_before = export_json(page)
    for eq in exported_before["questions"]:
        if eq["type"] == "single":
            assert eq["response"]["choice"] == answers[eq["id"]]["choice"]
        if eq["type"] == "multi":
            assert eq["response"]["choices"] == sorted(answers[eq["id"]]["choices"])

    # code answer: Tab indents (4 spaces), Shift+Tab outdents, Esc then Tab leaves the box
    code_q = next(q for q in quiz.questions if q.type == "code")
    ta = page.locator(f"#card-{code_q.id} textarea")
    assert "todo!()" in ta.input_value()
    ta.click()
    ta.press("Control+End")
    ta.press("Enter")
    ta.press("Tab")
    ta.type("x")
    assert ta.input_value().endswith("\n    x")
    ta.press("Home")
    ta.press("Shift+Tab")
    assert ta.input_value().endswith("\nx")
    ta.press("Escape")
    ta.press("Tab")
    assert not ta.evaluate("e => e === document.activeElement")
    ta.fill(code_q.spec.reference)

    page.click("#submit-btn")
    page.click("#dlg-ok")
    page.wait_for_selector("#results")
    with page.expect_download() as dl:
        page.click("#export-btn")
        page.click("#export-download")
    download = dl.value
    assert re.fullmatch(
        r"rust-basics-results-\d{8}-\d{4}\.json", download.suggested_filename
    )
    path = tmp_path / download.suggested_filename
    download.save_as(path)
    exported = json.loads(path.read_text(encoding="utf-8"))
    validate_results(exported)
    assert (
        exported["attempt"]["submitted"] is True
        and exported["format"] == "fullmark-results"
    )
    code_eq = next(e for e in exported["questions"] if e["type"] == "code")
    assert code_eq["status"] == "pending" and code_eq["response"]["language"] == "rust"
    assert "largest" in code_eq["response"]["code"]

    report, _ = grade_cli(tmp_path, exported, src, capsys)
    pending = report.split("## Pending AI review")[1]
    assert "### Q11: code (3 pts)" in pending or "code (3 pts)" in pending
    assert "fn largest" in pending and "```rust" in pending
    assert not page.errors


# ---------------------------------------------------------------- ielts


def test_ielts_timeout_autosubmit(page, ielts_html, tmp_path, capsys):
    src = EXAMPLES / "ielts-writing.md"
    start(page, ielts_html)
    counters = page.locator(".qm-counter")
    assert "0 words (minimum 150)" in counters.nth(0).text_content()
    assert "0 words (minimum 250)" in counters.nth(1).text_content()
    page.locator("#card-q1 textarea").fill(
        "The chart shows a clear fall in car use over twenty years."
    )
    page.locator("#card-q2 textarea").fill(
        "I agree  with   the statement\nto some extent"
    )
    assert counters.nth(0).text_content().startswith("12 words")
    assert "below the minimum" in counters.nth(0).text_content()
    assert counters.nth(0).get_attribute("class").split()[-1] == "low"
    assert counters.nth(1).text_content().startswith("8 words")

    page.wait_for_selector(".qm-timeup", timeout=20_000)
    assert "Time's up" in page.locator(".qm-timeup").text_content()
    assert all(t.is_disabled() for t in page.locator("textarea").all())
    assert page.locator("#submit-btn").is_hidden()

    with page.expect_download() as dl:
        page.click("#export-btn")
        page.click("#export-download")
    path = tmp_path / dl.value.suggested_filename
    dl.value.save_as(path)
    data = json.loads(path.read_text(encoding="utf-8"))
    validate_results(data)
    assert data["attempt"]["timed_out"] is True and data["attempt"]["submitted"] is True
    assert (
        data["attempt"]["time_limit_seconds"] == 10
        and data["attempt"]["elapsed_seconds"] == 10
    )
    essays = data["questions"]
    assert [e["status"] for e in essays] == ["pending", "pending"]
    assert [e["response"]["word_count"] for e in essays] == [12, 8]
    assert (
        data["score"]["pending_points"] == 30 and data["score"]["percent_auto"] is None
    )

    report, _ = grade_cli(tmp_path, data, src, capsys)
    pending = report.split("## Pending AI review")[1]
    assert "### Q1: essay (10 pts)" in pending and "### Q2: essay (20 pts)" in pending
    assert pending.count("- Overall band: ?") == 2
    assert "Task achievement band: ?" in pending and "Task response band: ?" in pending
    assert "Word count: 12 (minimum 150, below the minimum)" in pending
    assert "assets/ielts-chart.png" in pending
    assert not page.errors


# ---------------------------------------------------------------- kitchen sink


def test_kitchen_sink_every_type_and_resume(page, kitchen_html):
    quiz, _, _ = load_quiz(FIX / "all-types.md")
    start(page, kitchen_html)
    audio = page.locator("audio")
    assert audio.count() == 1 and audio.get_attribute("src").startswith(
        "data:audio/wav;base64,"
    )
    assert page.locator("img.qm-img").first.evaluate("e => e.naturalWidth") == 64

    for q in quiz.questions[:6]:
        fill(page, q, correct_response(q, quiz))
    assert page.locator("#progress").text_content() == "Answered 6/12"
    page.locator("#card-single1 input[value='0']").check()  # change an answer
    page.locator("#card-multi1 .qm-flag input").check()
    page.locator("#card-tf1 .qm-hint button, .qm-hint button").first.click()
    page.wait_for_timeout(2200)  # let the clock tick and the debounce save

    page.reload()
    assert page.locator("#start-btn").count() == 0
    page.click("#resume-btn")
    page.wait_for_selector("#quiz-screen .qm-card")
    assert page.locator("#progress").text_content() == "Answered 6/12"
    assert page.locator("#card-single1 input[value='0']").is_checked()
    assert page.locator("#card-multi1 .qm-flag input").is_checked()
    assert page.locator("#card-blanks1 .qm-blank").first.input_value() == "cos x"
    timer = page.locator("#timer").text_content()
    assert re.fullmatch(r"19:\d\d", timer), timer  # resumed, not restarted at 20:00

    # answer the rest, check one, submit
    for q in quiz.questions[6:]:
        fill(page, q, correct_response(q, quiz))
    page.locator("#card-tf1 .qm-check").click()
    assert page.locator("#card-tf1.st-correct").count() == 1
    page.click("#submit-btn")
    page.click("#dlg-ok")
    page.wait_for_selector("#results")
    e = export_json(page)
    assert len(e["questions"]) == 12 and e["attempt"]["submitted"] is True
    assert {q["type"] for q in e["questions"]} == {
        "single",
        "multi",
        "truefalse",
        "numeric",
        "short",
        "blanks",
        "fields",
        "ordering",
        "matching",
        "essay",
        "code",
    }
    fields = next(q for q in e["questions"] if q["type"] == "fields")
    assert fields["correct"]["results"] == [True, True, None]

    # a finished attempt is restored as results; Start over clears it
    page.evaluate("window.dispatchEvent(new Event('pagehide'))")
    page.reload()
    assert page.locator("#resume-btn").text_content() == "View results"
    page.click("#resume-btn")
    page.wait_for_selector("#results")
    page.reload()
    page.click("#restart-btn")
    page.click("#dlg-ok")
    page.wait_for_selector("#start-btn")
    assert (
        page.evaluate(
            "Object.keys(localStorage).filter(k => k.startsWith('fullmark:') && k !== 'fullmark:theme' && k !== 'fullmark:fontscale' && k !== 'fullmark:legend').length"
        )
        == 0
    )
    assert not page.errors


def test_works_with_storage_blocked(browser, kitchen_html):
    ctx = browser.new_context()
    ctx.add_init_script(
        "Object.defineProperty(window, 'localStorage', {get() { throw new DOMException('blocked', 'SecurityError'); }});"
    )
    pg = ctx.new_page()
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    quiz, _, _ = load_quiz(FIX / "all-types.md")
    pg.goto(kitchen_html.as_uri())
    pg.click("#start-btn")
    q = quiz.questions[0]
    fill(pg, q, correct_response(q, quiz))
    pg.locator(f"#card-{q.id} .qm-check").click()
    assert pg.locator(f"#card-{q.id}.st-correct").count() == 1
    open_display(pg)
    pg.click("#theme-btn")
    pg.click("#submit-btn")
    pg.click("#dlg-ok")
    pg.wait_for_selector("#results")
    pg.reload()
    assert pg.locator("#start-btn").count() == 1  # nothing was saved, so no resume
    assert not errors, errors
    ctx.close()


# ---------------------------------------------------------------- offline, size, phone, theme


@pytest.mark.parametrize("which", ["calculus", "rust", "kitchen"])
def test_no_network_requests(browser, which, calculus_html, rust_html, kitchen_html):
    html = {"calculus": calculus_html, "rust": rust_html, "kitchen": kitchen_html}[
        which
    ]
    ctx = browser.new_context()
    pg = ctx.new_page()
    seen = []
    pg.on("request", lambda r: seen.append(r.url))
    pg.goto(html.as_uri())
    pg.click("#start-btn")
    pg.wait_for_timeout(300)
    pg.click("#export-btn")
    outside = [u for u in seen if not u.startswith("data:") and u != html.as_uri()]
    assert outside == [], outside
    ctx.close()


def test_no_network_requests_ielts(browser, ielts_html):
    ctx = browser.new_context()
    pg = ctx.new_page()
    seen = []
    pg.on("request", lambda r: seen.append(r.url))
    pg.goto(ielts_html.as_uri())
    pg.click("#start-btn")
    pg.wait_for_timeout(300)
    assert [
        u for u in seen if not u.startswith("data:") and u != ielts_html.as_uri()
    ] == []
    ctx.close()


def test_size_budget(calculus_html, rust_html, ielts_html):
    assert calculus_html.stat().st_size < 2 * 1024 * 1024
    assert "katex" not in rust_html.read_text(encoding="utf-8").lower()
    assert "katex" not in ielts_html.read_text(encoding="utf-8").lower()
    assert "katex" in calculus_html.read_text(encoding="utf-8").lower()


@pytest.mark.parametrize("which", ["calculus", "rust"])
def test_phone_width_no_horizontal_scroll(browser, which, calculus_html, rust_html):
    html = {"calculus": calculus_html, "rust": rust_html}[which]
    ctx = browser.new_context(
        viewport={"width": 360, "height": 740}, is_mobile=True, device_scale_factor=2
    )
    pg = ctx.new_page()
    pg.goto(html.as_uri())
    pg.click("#start-btn")
    pg.wait_for_selector(".qm-card")
    assert pg.evaluate("document.documentElement.scrollWidth") <= 360
    ctx.close()


def test_light_dark_and_toggle(browser, kitchen_html):
    def bg(pg):
        return pg.evaluate("getComputedStyle(document.body).backgroundColor")

    light = browser.new_context(color_scheme="light")
    pg = light.new_page()
    pg.goto(kitchen_html.as_uri())
    assert pg.evaluate("document.documentElement.dataset.theme") == "light"
    assert bg(pg) == "rgb(236, 234, 229)"  # light page
    assert (
        pg.evaluate(
            "getComputedStyle(document.querySelector('#start-btn')).backgroundColor"
        )
        == "rgb(79, 106, 148)"
    )  # light accent
    open_display(pg)
    pg.click("#theme-btn")
    assert (
        pg.evaluate("document.documentElement.dataset.theme") == "dark"
        and bg(pg) == "rgb(27, 29, 34)"
    )  # dark page
    pg.reload()
    assert bg(pg) == "rgb(27, 29, 34)"  # remembered
    light.close()

    dark = browser.new_context(color_scheme="dark")
    pg = dark.new_page()
    pg.goto(kitchen_html.as_uri())
    assert bg(pg) == "rgb(27, 29, 34)"
    assert (
        pg.evaluate(
            "getComputedStyle(document.querySelector('#start-btn')).backgroundColor"
        )
        == "rgb(143, 168, 212)"
    )  # dark accent
    pg.click("#start-btn")
    code_bg = pg.evaluate(
        "getComputedStyle(document.querySelector('pre.qm-code')).backgroundColor"
    )
    assert code_bg == "rgb(21, 23, 27)"  # dark sunken
    dark.close()


def test_locked_light_theme_ignores_device_and_hides_toggle(browser, tmp_path):
    src = tmp_path / "q.md"
    src.write_text(
        "---\ntitle: Locked\ntheme: light\n---\n\n## One?\n\n- [x] a\n- [ ] b\n",
        encoding="utf-8",
    )
    out = build_to(tmp_path, src)
    ctx = browser.new_context(color_scheme="dark")
    pg = ctx.new_page()
    pg.goto(out.as_uri())
    pg.click("#start-btn")
    assert pg.evaluate("document.documentElement.dataset.theme") == "light"
    open_display(pg)
    assert pg.is_visible("#font-larger") and not pg.is_visible("#theme-btn")
    ctx.close()


# ---------------------------------------------------------------- question bank


def _bank_html(tmp_path):
    from test_bank import BANK

    src = tmp_path / "bank.md"
    src.write_text(BANK.format(front=""), encoding="utf-8")
    return src, build_to(tmp_path, src)


def _card_ids(pg):
    return pg.eval_on_selector_all(".qm-card", "els => els.map(e => e.dataset.id)")


def test_bank_draws_a_subset_and_resumes_the_same_draw(page, tmp_path):
    _src, html = _bank_html(tmp_path)
    page.goto(html.as_uri())
    assert "(random draw from 4)" in page.inner_text("#start-screen")
    assert page.inner_text(".qm-facts dd").startswith(
        "3"
    )  # 2 from limits + 1 from rules
    draws = set()
    for i in range(12):
        if i:
            page.reload()
        if page.locator("#restart-btn").count():
            page.click("#restart-btn")
            page.click("#dlg-ok")
        page.click("#start-btn")
        page.wait_for_selector(".qm-card")
        ids = _card_ids(page)
        assert len(ids) == 3 and "q4" in ids  # the un-picked section is always whole
        assert len([i for i in ids if i != "q4"]) == 2
        assert page.inner_text("#progress") == "Answered 0/3"
        draws.add(tuple(ids))
    assert len(draws) > 1, "the draw never changed"

    before = _card_ids(page)
    page.reload()
    page.click("#resume-btn")
    page.wait_for_selector(".qm-card")
    assert _card_ids(page) == before


def test_bank_export_records_the_draw_and_grades(page, tmp_path, capsys):
    src, html = _bank_html(tmp_path)
    start(page, html)
    ids = _card_ids(page)
    exp = export_json(page)
    assert (
        exp["attempt"]["bank"]["drawn"] == ids and exp["attempt"]["bank"]["pool"] == 4
    )
    assert [q["id"] for q in exp["questions"]] == ids
    assert exp["score"]["possible_total"] == 3
    report, err = grade_cli(tmp_path, exp, src, capsys)
    assert "3 questions drawn from a pool of 4" in report
    assert "expected" not in err


# ---------------------------------------------------------------- Enter checks


def test_enter_checks_in_instant_mode(page, calculus_html):
    quiz, _, _ = load_quiz(EXAMPLES / "calculus-1.md")
    start(page, calculus_html)
    for kind in ("numeric", "blanks"):
        q = next(q for q in quiz.questions if q.type == kind)
        fill(page, q, correct_response(q, quiz))
        field = page.locator(
            f"#card-{q.id} input[type=text], #card-{q.id} .qm-input"
        ).last
        field.press("Enter")
        assert "st-correct" in page.locator(f"#card-{q.id}").get_attribute("class"), (
            kind
        )
    # Enter on an empty answer asks for an answer instead of grading
    empty = next(q for q in quiz.questions if q.type == "fields")
    page.locator(f"#card-{empty.id} [data-field='0']").press("Enter")
    assert "locked" not in page.locator(f"#card-{empty.id}").get_attribute("class")
    assert page.locator(f"#card-{empty.id} .qm-feedback").count() == 1
    assert not page.errors


END_MODE_QUIZ = """\
---
title: T
feedback: end
---

## 1+1? {type=numeric}

```answer
value: 2
```

> [!explanation]
> Two.

## Write {type=essay}

```answer
min_words: 1
rubric:
  - "Clarity: is it clear"
```
"""


def test_enter_does_nothing_without_instant_feedback_or_in_textareas(browser, tmp_path):
    md = tmp_path / "q.md"
    md.write_text(END_MODE_QUIZ, encoding="utf-8")
    pg = browser.new_page()
    start(pg, build_to(tmp_path, md))
    num = pg.locator(".qm-card").first
    num.locator(".qm-input").fill("2")
    num.locator(".qm-input").press("Enter")
    assert "locked" not in num.get_attribute("class")
    area = pg.locator("textarea").first
    area.fill("one")
    area.press("Enter")
    area.type("two")
    assert area.input_value() == "one\ntwo"
    pg.close()


# ---------------------------------------------------------------- text size


def _body_px(pg) -> float:
    return pg.evaluate("parseFloat(getComputedStyle(document.body).fontSize)")


def test_font_size_buttons_scale_and_persist(browser, calculus_html):
    ctx = browser.new_context(viewport={"width": 1000, "height": 900})
    pg = ctx.new_page()
    pg.goto(calculus_html.as_uri())
    assert _body_px(pg) == 18
    open_display(pg)
    pg.click("#font-larger")
    pg.click("#font-larger")
    assert _body_px(pg) == 22.5
    pg.reload()
    assert _body_px(pg) == 22.5  # remembered, and applied before the page script runs
    pg.click("#start-btn")
    open_display(pg)  # the same menu sits in the quiz header
    pg.click("#font-smaller")
    assert _body_px(pg) == 20.25
    while pg.locator("#font-smaller").is_enabled():
        pg.click("#font-smaller")
    assert _body_px(pg) == 15.75 and pg.locator("#font-smaller").is_disabled()
    assert pg.locator("#font-larger").is_enabled()
    assert pg.locator("#font-larger").get_attribute("aria-label") == "Larger text"
    ctx.close()


def test_font_size_buttons_work_with_storage_blocked(browser, calculus_html):
    ctx = browser.new_context()
    ctx.add_init_script(
        "Object.defineProperty(window, 'localStorage', {get() { throw new DOMException('blocked', 'SecurityError'); }});"
    )
    pg = ctx.new_page()
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.goto(calculus_html.as_uri())
    open_display(pg)
    pg.click("#font-larger")
    assert _body_px(pg) == 20.25
    assert not errors, errors
    ctx.close()


def test_phone_progress_stays_visible_while_scrolling(browser, calculus_html):
    ctx = browser.new_context(
        viewport={"width": 375, "height": 700}, is_mobile=True, device_scale_factor=2
    )
    pg = ctx.new_page()
    pg.goto(calculus_html.as_uri())
    pg.click("#start-btn")
    pg.wait_for_selector(".qm-card")
    pg.locator(".qm-card").last.scroll_into_view_if_needed()
    pg.evaluate("window.scrollTo(0, document.body.scrollHeight)")
    box = pg.locator("#progress").bounding_box()
    assert box and box["y"] >= 0 and box["y"] + box["height"] <= 700
    assert re.fullmatch(r"Answered \d+/\d+", pg.locator("#progress").text_content())
    header = pg.locator(".qm-header").bounding_box()
    assert header["height"] <= 700 * 0.4, (
        f"sticky header takes {header['height']:.0f}px of 700"
    )
    # the question pills scroll sideways in one row instead of wrapping onto many rows
    nav = pg.locator(".qm-nav")
    assert nav.bounding_box()["height"] <= 60
    assert nav.evaluate("e => e.scrollWidth > e.clientWidth")
    assert pg.evaluate("document.documentElement.scrollWidth") <= 375
    ctx.close()


@pytest.mark.parametrize("width", [375, 768, 1920])
def test_text_stays_readable_at_every_width(browser, width, calculus_html):
    ctx = browser.new_context(viewport={"width": width, "height": 900})
    pg = ctx.new_page()
    pg.goto(calculus_html.as_uri())
    pg.click("#start-btn")
    pg.wait_for_selector(".qm-card")
    assert pg.evaluate("document.documentElement.scrollWidth") <= width
    widest = pg.evaluate(
        """() => {
          const ps = [...document.querySelectorAll('.qm-card .qm-body > p, .qm-card .qm-title > p')];
          const ch = (el) => {
            const probe = document.createElement('span');
            probe.textContent = '0';
            probe.style.cssText = 'position:absolute;visibility:hidden';
            el.appendChild(probe);
            const w = probe.getBoundingClientRect().width;
            probe.remove();
            return el.getBoundingClientRect().width / w;
          };
          return { n: ps.length, widest: Math.max(0, ...ps.map(ch)) };
        }"""
    )
    assert widest["n"] > 0
    assert widest["widest"] <= 82, (
        f"a paragraph is {widest['widest']:.0f} characters wide at {width}px"
    )
    ctx.close()


def test_needs_review_filter_after_submit(page, kitchen_html):
    quiz, _, _ = load_quiz(FIX / "all-types.md")
    start(page, kitchen_html)
    for q in quiz.questions[:2]:
        fill(page, q, correct_response(q, quiz))
    page.click("#submit-btn")
    page.click("#dlg-ok")
    page.wait_for_selector("#results")
    per = {x["id"]: x for x in export_json(page)["questions"]}
    need = {
        k
        for k, g in per.items()
        if g["status"] in ("incorrect", "partial", "unanswered")
    }
    assert need and len(need) < len(per)

    btn = page.locator(".qm-filter button", has_text="Needs review")
    assert btn.text_content() == f"Needs review ({len(need)})"
    assert btn.get_attribute("aria-pressed") == "false"
    btn.click()
    assert btn.get_attribute("aria-pressed") == "true"
    shown = {c.get_attribute("id")[5:] for c in page.locator(".qm-card:visible").all()}
    assert shown == need
    assert page.locator(".qm-pill:visible").count() == len(need)
    assert "need review" in page.locator("#live").text_content()

    page.locator(".qm-filter button", has_text="All questions").click()
    assert page.locator(".qm-card:visible").count() == len(per)
    assert page.locator(".qm-pill:visible").count() == len(per)
    assert not page.errors


def test_print_with_answers_shows_every_correct_answer(page, kitchen_html):
    quiz, _, _ = load_quiz(FIX / "all-types.md")
    start(page, kitchen_html)
    for q in quiz.questions:
        fill(page, q, correct_response(q, quiz))
    page.click("#submit-btn")
    page.click("#dlg-ok")
    page.wait_for_selector("#results")
    page.evaluate("window.print = () => { window.__printed = document.body.className }")
    page.emulate_media(media="print")
    assert page.locator(".qm-key-only:visible").count() == 0
    page.emulate_media(media="screen")
    page.click("#print-key-btn")
    assert "qm-print-key" in page.evaluate("window.__printed")
    page.emulate_media(media="print")
    key = page.locator(".qm-key-only:visible").count()
    assert key > 0
    # choice questions already mark the right rows; every other auto-graded card prints its answer
    for card in page.locator(".qm-card.st-correct").all():
        assert card.locator(
            ".qm-choice.ok, .qm-correct-answer:visible"
        ).count() > 0 or card.get_attribute("data-type") in ("essay", "code")
    assert not page.errors


def test_retry_missed_questions(page, kitchen_html, tmp_path, capsys):
    quiz, _, _ = load_quiz(FIX / "all-types.md")
    start(page, kitchen_html)
    for q in quiz.questions[:2]:
        fill(page, q, correct_response(q, quiz))
    page.click("#submit-btn")
    page.click("#dlg-ok")
    page.wait_for_selector("#results")
    first = export_json(page)
    missed = [
        x["id"]
        for x in first["questions"]
        if x["status"] in ("incorrect", "partial", "unanswered")
    ]
    btn = page.locator("#retry-btn")
    assert btn.text_content() == f"Retry missed ({len(missed)})"
    btn.click()
    page.locator("#dlg-ok").click()  # not exported yet: discard warning
    page.wait_for_selector("#quiz-screen .qm-card")
    assert page.locator(".qm-card").count() == len(missed)
    assert (
        page.locator("#results").count() == 0
        or page.locator("#results").inner_html() == ""
    )
    # a reload resumes the retry, not the full quiz
    page.evaluate("window.dispatchEvent(new Event('pagehide'))")
    page.reload()
    page.click("#resume-btn")
    page.wait_for_selector("#quiz-screen .qm-card")
    assert page.locator(".qm-card").count() == len(missed)
    page.click("#submit-btn")
    page.click("#dlg-ok")
    page.wait_for_selector("#results")
    e = export_json(page)
    assert len(e["questions"]) == len(missed)
    assert e["attempt"]["retry_of"] == first["attempt"]["started_at"]
    assert e["attempt"]["bank"]["drawn"] == missed
    md, err = grade_cli(tmp_path, e, FIX / "all-types.md", capsys)
    assert "warning" not in err.lower(), err
    assert "**Retry:**" in md
    assert not page.errors


def _order_texts(page, qid):
    return page.locator(f"#card-{qid} .qm-order-body").all_text_contents()


def test_ordering_keyboard_resume_and_feedback(page, kitchen_html):
    start(page, kitchen_html)
    card = page.locator("#card-ord1")
    shown = [
        li.get_attribute("data-item") for li in card.locator(".qm-order > li").all()
    ]
    assert sorted(shown) == ["0", "1", "2", "3"] and shown != ["0", "1", "2", "3"]
    # untouched: not counted as answered
    assert page.locator("#progress").text_content() == "Answered 0/12"
    # the buttons at either end are disabled
    assert card.locator(".qm-order > li").first.locator("[data-dir='-1']").is_disabled()
    assert card.locator(".qm-order > li").last.locator("[data-dir='1']").is_disabled()
    # reachable and operable by keyboard
    card.locator(".qm-order > li").nth(1).locator("[data-dir='1']").focus()
    page.keyboard.press("Enter")
    assert "Moved to position" in page.locator("#live").text_content()
    assert page.locator("#progress").text_content() == "Answered 1/12"
    quiz, _, _ = load_quiz(FIX / "all-types.md")
    q = next(x for x in quiz.questions if x.id == "ord1")
    fill(page, q, {"order": [1, 0, 2, 3]})
    after = [
        li.get_attribute("data-item") for li in card.locator(".qm-order > li").all()
    ]
    assert after == ["1", "0", "2", "3"]

    page.evaluate("window.dispatchEvent(new Event('pagehide'))")
    page.reload()
    page.click("#resume-btn")
    page.wait_for_selector("#quiz-screen .qm-card")
    assert [
        li.get_attribute("data-item")
        for li in page.locator("#card-ord1 .qm-order > li").all()
    ] == after

    page.click("#submit-btn")
    page.click("#dlg-ok")
    page.wait_for_selector("#results")
    marks = [
        li.locator(".qm-mark").text_content()
        for li in page.locator("#card-ord1 .qm-order > li").all()
    ]
    assert marks == ["✗", "✗", "✓", "✓"]
    assert page.locator("#card-ord1 .qm-order button:enabled").count() == 0
    assert page.locator("#card-ord1 .qm-correct-answer").count() == 1
    e = export_json(page)
    row = next(x for x in e["questions"] if x["id"] == "ord1")
    assert row["response"] == {"order": [1, 0, 2, 3]} and row["status"] == "partial"
    assert row["correct"]["order"] == [0, 1, 2, 3] and row["earned"] == 1
    assert not page.errors


def test_matching_select_resume_and_feedback(page, kitchen_html):
    start(page, kitchen_html)
    card = page.locator("#card-match1")
    selects = card.locator("select")
    assert selects.count() == 3
    options = selects.first.locator("option").all_text_contents()
    assert options[0] == "Choose..." and sorted(options[1:]) == [
        "cargo",
        "make",
        "npm",
        "pip",
    ]
    selects.nth(0).select_option(label="cargo")
    selects.nth(1).select_option(label="npm")  # wrong on purpose
    assert page.locator("#progress").text_content() == "Answered 1/12"
    page.evaluate("window.dispatchEvent(new Event('pagehide'))")
    page.reload()
    page.click("#resume-btn")
    page.wait_for_selector("#quiz-screen .qm-card")
    got = page.locator("#card-match1 select").evaluate_all(
        "els => els.map(e => e.selectedOptions[0].text)"
    )
    assert got == ["cargo", "npm", "Choose..."]

    page.click("#submit-btn")
    page.click("#dlg-ok")
    page.wait_for_selector("#results")
    marks = page.locator("#card-match1 .qm-mark").all_text_contents()
    assert [m.strip() for m in marks] == ["✓", "✗", "✗"]
    assert page.locator("#card-match1 select:enabled").count() == 0
    row = next(x for x in export_json(page)["questions"] if x["id"] == "match1")
    assert row["response"] == {"pairs": [0, 2, None]} and row["status"] == "partial"
    assert row["correct"]["pairs"] == [0, 1, 2] and row["earned"] == 1
    assert not page.errors


def test_ordering_and_matching_instant_check(browser, tmp_path):
    src = tmp_path / "q.md"
    src.write_text(
        "---\ntitle: T\nfeedback: instant\n---\n\n"
        "## Order {id=o type=ordering}\n\n1. a\n2. b\n3. c\n\n"
        "## Match {id=m type=matching}\n\n- x :: 1\n- y :: 2\n",
        encoding="utf-8",
    )
    quiz, _, _ = load_quiz(src)
    out = build_to(tmp_path, src)
    ctx = browser.new_context(viewport={"width": 1000, "height": 900})
    pg = ctx.new_page()
    pg.goto(out.as_uri())
    pg.click("#start-btn")
    fill(pg, quiz.questions[0], {"order": [0, 1, 2]})
    pg.locator("#card-o .qm-check").click()
    assert pg.locator("#card-o.st-correct").count() == 1
    fill(pg, quiz.questions[1], {"pairs": [0, 0]})
    pg.locator("#card-m .qm-check").click()
    assert pg.locator("#card-m.st-partial").count() == 1
    ctx.close()


@pytest.mark.parametrize("clicks", [0, 2, 3])
def test_choice_controls_follow_text_size_and_line_up(page, kitchen_html, clicks):
    start(page, kitchen_html)
    if clicks:
        open_display(page)
    for _ in range(clicks):
        page.click("[aria-label='Larger text']")
    if clicks:
        page.keyboard.press("Escape")
    for qid in ("single1", "multi1"):  # a radio group and a checkbox group
        rows = page.locator(f"#card-{qid} .qm-choice")
        for i in range(rows.count()):
            m = rows.nth(i).evaluate(
                """row => {
                  const input = row.querySelector('input');
                  const r = input.getBoundingClientRect();
                  const range = document.createRange();
                  range.selectNodeContents(row.querySelector('.qm-choice-body'));
                  const line = range.getClientRects()[0];
                  const fs = parseFloat(getComputedStyle(row).fontSize);
                  return { w: r.width, h: r.height, fs,
                           off: Math.abs((r.top + r.height / 2) - (line.top + line.height / 2)) };
                }"""
            )
            # sized from the text (1.3em), not the browser's fixed 13px control
            assert abs(m["w"] - 1.3 * m["fs"]) < 0.6 and abs(m["h"] - m["w"]) < 0.1, m
            assert m["w"] >= 20, m
            assert m["off"] < 2, (
                f"control is {m['off']:.1f}px off the first line of text"
            )


def test_long_quiz_header_stays_short_and_follows_the_reader(browser, tmp_path):
    body = "".join(
        f"## Question {i}? {{id=q{i}}}\n\n- [x] yes\n- [ ] no\n\n" for i in range(1, 61)
    )
    src = tmp_path / "long.md"
    src.write_text("---\ntitle: Long\n---\n\n" + body, encoding="utf-8")
    html = build_to(tmp_path, src)
    ctx = browser.new_context(viewport={"width": 900, "height": 700})
    pg = ctx.new_page()
    pg.goto(html.as_uri())
    pg.click("#start-btn")
    pg.wait_for_selector(".qm-card")
    open_display(pg)
    for _ in range(3):  # the largest text size
        pg.click("[aria-label='Larger text']")
    pg.keyboard.press("Escape")
    nav = pg.locator(".qm-nav")
    assert "qm-nav-scroll" in nav.get_attribute("class")
    assert nav.evaluate("e => e.scrollWidth > e.clientWidth")
    assert pg.locator(".qm-header").bounding_box()["height"] <= 700 * 0.3
    assert pg.evaluate("document.documentElement.scrollWidth") <= 900

    # jumping to a question highlights its pill and keeps it inside the strip
    nav.locator(
        ".qm-pill", has_text="45"
    ).first.click()  # scrolls the strip, then the page
    pg.wait_for_function(
        "() => document.querySelector(\"[aria-current='true']\")?.textContent === '45'"
    )
    pill = pg.locator(".qm-pill[aria-current='true']")
    assert pill.count() == 1
    box, strip = pill.bounding_box(), nav.bounding_box()
    assert (
        strip["x"] <= box["x"]
        and box["x"] + box["width"] <= strip["x"] + strip["width"] + 1
    )

    # a short quiz keeps the wrapped layout
    pg.goto(build_to(tmp_path, FIX / "all-types.md", "kitchen2.html").as_uri())
    pg.click("#start-btn")
    pg.wait_for_selector(".qm-card")
    assert "qm-nav-scroll" not in pg.locator(".qm-nav").get_attribute("class")
    ctx.close()


def test_long_quiz_panel_grid_scrolls_on_its_own(browser, tmp_path):
    def quiz(name, count):
        body = "".join(
            f"## Question {i}? {{id=q{i}}}\n\n- [x] yes\n- [ ] no\n\n"
            for i in range(1, count + 1)
        )
        src = tmp_path / f"{name}.md"
        src.write_text(f"---\ntitle: {name}\n---\n\n" + body, encoding="utf-8")
        return build_to(tmp_path, src, f"{name}.html")

    ctx = browser.new_context(viewport={"width": 1280, "height": 900})
    pg = ctx.new_page()
    pg.goto(quiz("long", 60).as_uri())
    pg.click("#start-btn")
    pg.wait_for_selector(".qm-card")
    nav = pg.locator(".qm-panel .qm-nav")
    assert "qm-nav-long" in nav.get_attribute("class")
    assert nav.evaluate("e => e.scrollHeight > e.clientHeight")
    assert nav.evaluate("e => e.scrollWidth <= e.clientWidth")

    # reading question 55 brings its pill into the grid's view
    pg.locator("#card-q55").evaluate("e => e.scrollIntoView({block: 'start'})")
    pg.wait_for_function(
        "() => document.querySelector(\"[aria-current='true']\")?.textContent === '55'"
    )
    pg.wait_for_timeout(600)  # smooth scroll
    box, grid = (
        pg.locator(".qm-pill[aria-current='true']").bounding_box(),
        nav.bounding_box(),
    )
    assert (
        grid["y"] - 1 <= box["y"]
        and box["y"] + box["height"] <= grid["y"] + grid["height"] + 1
    )

    # 40 questions still show the whole grid
    pg.goto(quiz("forty", 40).as_uri())
    pg.click("#start-btn")
    pg.wait_for_selector(".qm-card")
    assert "qm-nav-long" not in nav.get_attribute("class")
    assert nav.evaluate("e => e.scrollHeight <= e.clientHeight")
    ctx.close()


@pytest.mark.parametrize("which", ["calculus", "rust", "kitchen"])
def test_no_stray_null_or_undefined_text(
    page, which, calculus_html, rust_html, kitchen_html
):
    html = {"calculus": calculus_html, "rust": rust_html, "kitchen": kitchen_html}[
        which
    ]
    start(page, html)
    stray = page.evaluate(
        """() => [...document.querySelectorAll('.qm-card *')]
          .filter(e => !e.children.length && /^(null|undefined|NaN)$/.test(e.textContent.trim()))
          .length + [...document.querySelectorAll('.qm-card')]
          .filter(c => [...c.childNodes].some(n => n.nodeType === 3 && /^(null|undefined)$/.test(n.textContent.trim())))
          .length"""
    )
    assert stray == 0
    # numeric answers carry no stray text next to the box
    for card in page.locator(".qm-card:has(.qm-input[inputmode='decimal'])").all():
        text = card.locator(".qm-answer").inner_text()
        assert "null" not in text and "undefined" not in text, text


def test_theme_toggle_is_an_icon_with_a_label(kitchen_html, browser):
    pg = browser.new_page()
    pg.goto(kitchen_html.as_uri())
    pg.click("#start-btn")
    open_display(pg)
    before = pg.get_attribute("#theme-btn", "aria-label")
    assert pg.locator("#theme-btn svg").count() == 1
    assert pg.inner_text("#theme-btn").strip() == ""
    pg.click("#theme-btn")
    assert pg.get_attribute("#theme-btn", "aria-label") != before
    pg.close()


# ---------------------------------------------------------------- questionnaires


@pytest.fixture(scope="session")
def survey_html(tmp_path_factory):
    return build_to(tmp_path_factory.mktemp("survey"), FIX / "survey.md")


@pytest.fixture(scope="session")
def mixed_html(tmp_path_factory):
    return build_to(tmp_path_factory.mktemp("mixed"), FIX / "mixed.md")


SURVEY_ANSWERS = {
    "how": {"choice": 1},
    "help": {"choices": [0, 2]},
    "name": {"text": "Sam"},
    "details": {"fields": ["Signals", "3"]},
    "conf": {"value": 4},
    "sleep": {"value": 7},
    "more": {"text": "Nothing else, thanks.", "word_count": 4},
}


def _answer_survey(page, quiz):
    for q in quiz.questions:
        if q.id in SURVEY_ANSWERS:
            fill(page, q, SURVEY_ANSWERS[q.id])
    page.locator(
        "#card-rank [data-dir='1']"
    ).first.click()  # rank: move the first item down


def test_survey_shows_no_score_and_no_right_or_wrong(page, survey_html):
    quiz, _, _ = load_quiz(FIX / "survey.md")
    page.goto(survey_html.as_uri())
    assert "points" not in page.locator("#start-screen").text_content()
    page.click("#start-btn")
    page.wait_for_selector("#quiz-screen .qm-card")
    assert page.locator(".qm-points, .qm-check").count() == 0
    assert page.locator("#submit-btn").text_content() == "Finish"
    _answer_survey(page, quiz)
    assert page.locator("#progress").text_content() == "Answered 8/8"
    page.click("#submit-btn")
    assert "Finish" in page.locator("#dlg-ok").text_content()
    page.click("#dlg-ok")
    page.wait_for_selector("#results")
    results = page.locator("#results").text_content()
    assert "Your answers are ready" in results and "Answered 8 of 8" in results
    # the panel may show completion as a percentage, but never a score
    page_text = page.locator(".qm-main").text_content()
    assert page.locator("#panel-score").is_hidden()
    for word in (
        "Correct",
        "Incorrect",
        "Passed",
        "pts",
        "auto-graded",
        "Pending",
        "%",
    ):
        assert word not in page_text, word
    assert (
        page.locator(".qm-score, .qm-badge, .qm-correct-answer, .qm-mark").count() == 0
    )
    assert page.locator("#retry-btn, .qm-filter, #print-key-btn").count() == 0
    assert page.locator("#export-btn-2.qm-btn-primary").count() == 1
    # the answers are shown, and the explanation is labelled as such
    assert "4 / 5" in page.locator("#card-conf .qm-your-answer").text_content()
    why = page.locator("#card-how .qm-explain")
    assert "Why this is asked" in why.text_content()
    assert not page.errors


def test_survey_export_validates_and_has_no_score(page, survey_html, tmp_path, capsys):
    quiz, _, _ = load_quiz(FIX / "survey.md")
    start(page, survey_html)
    _answer_survey(page, quiz)
    page.click("#submit-btn")
    page.click("#dlg-ok")
    exported = export_json(page)
    assert exported["attempt"]["mode"] == "survey"
    assert exported["score"]["earned"] == 0 and exported["score"]["possible_total"] == 0
    assert exported["score"]["percent_auto"] is None
    by_id = {q["id"]: q for q in exported["questions"]}
    assert {q["status"] for q in exported["questions"]} == {"ungraded"}
    assert all(
        q["earned"] is None and q["correct"] is None for q in exported["questions"]
    )
    assert by_id["conf"]["response"] == {"value": 4}
    assert by_id["rank"]["response"]["order"] == [1, 0, 2]
    assert not page.errors
    # quiz grade turns the export into an Answers report
    report, stderr = grade_cli(tmp_path, exported, FIX / "survey.md", capsys)
    assert report.startswith("# Answers: Fixture survey") and "Score" not in report
    assert "4 / 5 (Very confident)" not in report and "4 / 5" in report
    assert "1. Exercise\n2. Sleep\n3. Study" in report
    assert stderr == ""


def test_quiz_with_ungraded_questions_scores_only_the_graded_ones(page, mixed_html):
    quiz, _, _ = load_quiz(FIX / "mixed.md")
    start(page, mixed_html)
    assert page.locator("#card-sure .qm-points").text_content() == "Not scored"
    assert page.locator("#card-colour .qm-points").text_content() == "Not scored"
    fill(page, quiz.questions[0], {"choice": 1})  # 2 + 2 = 4, right
    fill(page, quiz.questions[1], {"value": 2})
    fill(page, quiz.questions[2], {"text": "Because I guessed.", "word_count": 3})
    fill(page, quiz.questions[3], {"choice": 2})
    fill(page, quiz.questions[4], {"text": "Lyon"})  # wrong, worth 2
    page.click("#submit-btn")
    page.click("#dlg-ok")
    page.wait_for_selector("#results")
    assert page.locator(".qm-score").text_content() == "33.33%"
    assert "1 of 3 auto-graded points" in page.locator("#results").text_content()
    for qid in ("sure", "why", "colour"):
        card = page.locator(f"#card-{qid}")
        assert card.locator(".qm-badge").count() == 0, qid
        assert "Your answer" in card.locator(".qm-your-answer").text_content()
        assert "st-ungraded" in card.get_attribute("class")
    # only the graded miss can be retried
    assert page.locator("#retry-btn").text_content() == "Retry missed (1)"
    exported = export_json(page)
    assert exported["score"]["earned"] == 1 and exported["score"]["possible_auto"] == 3
    assert (
        exported["score"]["possible_total"] == 3
        and exported["score"]["pending_points"] == 0
    )
    by_id = {q["id"]: q for q in exported["questions"]}
    assert by_id["sure"]["status"] == "ungraded" and by_id["sure"]["points"] == 0
    assert exported["attempt"]["mode"] == "quiz"
    # the Python grader agrees with the browser
    got = score_attempt(quiz, {q["id"]: q["response"] for q in exported["questions"]})
    assert got["score"]["earned"] == 1 and got["score"]["possible_auto"] == 3
    assert not page.errors


def test_scale_is_reachable_and_operable_by_keyboard(page, survey_html):
    start(page, survey_html)
    group = page.locator("#card-conf [role='radiogroup']")
    assert group.get_attribute("aria-labelledby") == "t-conf"
    assert group.locator("input").count() == 5
    assert group.locator(".qm-scale-label").all_text_contents()[0] == "Not at all"
    page.locator("#card-conf input[type=radio]").first.focus()
    page.keyboard.press("Space")
    assert page.locator("#card-conf input[value='1']").is_checked()
    page.keyboard.press("ArrowRight")
    page.keyboard.press("ArrowRight")
    assert page.locator("#card-conf input[value='3']").is_checked()
    page.keyboard.press("ArrowLeft")
    assert page.locator("#card-conf input[value='2']").is_checked()
    assert page.evaluate("window.fullmark.state().answers.conf") == {"value": 2}
    # the focused option has a visible ring
    ring = page.locator("#card-conf input[value='2'] + .qm-scale-num").evaluate(
        "e => getComputedStyle(e).outlineStyle"
    )
    assert ring == "solid"
    # a click on the number picks it too, and a resume restores it
    five = page.locator("#card-conf input[value='5']")
    five.evaluate("e => e.scrollIntoView({ block: 'center' })")
    five.click()
    assert page.locator("#card-conf input[value='5']").is_checked()
    page.wait_for_timeout(500)
    page.reload()
    page.click("#resume-btn")
    page.wait_for_selector("#quiz-screen .qm-card")
    assert page.locator("#card-conf input[value='5']").is_checked()


def _drag_first_to_end(page, qid):
    items = page.locator(f"#card-{qid} .qm-order > li")
    page.evaluate(
        "id => document.querySelector('#card-' + id).scrollIntoView({block: 'center'})",
        qid,
    )
    grip = items.first.locator(".qm-order-grip").bounding_box()
    last = items.last.bounding_box()
    x, y = grip["x"] + grip["width"] / 2, grip["y"] + grip["height"] / 2
    page.mouse.move(x, y)
    page.mouse.down()
    target = last["y"] + last["height"] + 10
    steps = 12
    for k in range(1, steps + 1):
        page.mouse.move(x, y + (target - y) * k / steps)
    page.mouse.up()


def test_ordering_drag_with_pointer(page, kitchen_html):
    start(page, kitchen_html)
    card = page.locator("#card-ord1")

    def order():
        return [
            li.get_attribute("data-item") for li in card.locator(".qm-order > li").all()
        ]

    before = order()
    _drag_first_to_end(page, "ord1")
    after = order()
    assert after == before[1:] + before[:1]
    assert page.locator("#progress").text_content() == "Answered 1/12"
    assert "Moved to position 4 of 4" in page.locator("#live").text_content()
    assert page.evaluate("window.fullmark.state().answers.ord1") == {
        "order": [int(i) for i in after]
    }
    assert card.locator(".qm-dragging").count() == 0
    # a plain click on a button still works
    card.locator(".qm-order > li").nth(1).locator("[data-dir='1']").click()
    assert order() != after
    # locked after submit: dragging changes nothing
    page.click("#submit-btn")
    page.click("#dlg-ok")
    page.wait_for_selector("#results")
    locked = order()
    _drag_first_to_end(page, "ord1")
    assert order() == locked


def _order(page, qid):
    return [
        li.get_attribute("data-item")
        for li in page.locator(f"#card-{qid} .qm-order > li").all()
    ]


def test_ordering_drag_past_tall_item_follows_pointer(page, kitchen_html):
    start(page, kitchen_html)
    page.evaluate(
        "id => document.querySelector('#card-' + id).scrollIntoView({block: 'start'})",
        "ord1",
    )
    items = page.locator("#card-ord1 .qm-order > li")
    page.evaluate(
        "document.querySelectorAll('#card-ord1 .qm-order > li')[1].style.minHeight = '220px'"
    )
    start_order = _order(page, "ord1")
    tall_item = start_order[1]
    grip = items.first.locator(".qm-order-grip").bounding_box()
    x, y = grip["x"] + grip["width"] / 2, grip["y"] + grip["height"] / 2
    page.mouse.move(x, y)
    page.mouse.down()
    seen = []

    def drag_to(ty):
        nonlocal y
        for k in range(1, 16):
            yy = y + (ty - y) * k / 15
            page.mouse.move(x, yy)
            box = page.locator("#card-ord1 .qm-dragging").bounding_box()
            # the dragged row stays under the pointer, even next to a tall row
            assert box["y"] - 1 <= yy <= box["y"] + box["height"] + 1
            seen.append(tuple(_order(page, "ord1")))
        y = ty

    tall = page.locator(f"#card-ord1 [data-item='{tall_item}']").bounding_box()
    drag_to(tall["y"] + tall["height"] - 5)
    passed = _order(page, "ord1")
    assert passed.index(start_order[0]) == 1 and passed.index(tall_item) == 0
    drag_to(grip["y"] + 2)
    assert _order(page, "ord1") == start_order
    # no flicker: the order changes exactly twice (past the tall row, then back)
    runs = [o for i, o in enumerate(seen) if i == 0 or o != seen[i - 1]]
    assert len(runs) == 3 and runs[0] == runs[2] == tuple(start_order)
    page.mouse.up()
    assert _order(page, "ord1") == start_order
    assert page.locator("#progress").text_content() == "Answered 0/12"


def test_ordering_drag_autoscrolls_near_viewport_edge(page, kitchen_html):
    start(page, kitchen_html)
    page.set_viewport_size({"width": 900, "height": 500})
    page.wait_for_selector(
        ".qm-header #progress", state="attached"
    )  # moved on the change event
    page.evaluate(
        "id => document.querySelector('#card-' + id).scrollIntoView({block: 'start'})",
        "ord1",
    )
    page.evaluate(
        "document.querySelectorAll('#card-ord1 .qm-order > li').forEach(li => li.style.minHeight = '260px')"
    )
    before = _order(page, "ord1")
    grip = page.locator("#card-ord1 .qm-order > li").first.locator(".qm-order-grip")
    grip.scroll_into_view_if_needed()
    box = grip.bounding_box()
    x = box["x"] + box["width"] / 2
    page.mouse.move(x, box["y"] + box["height"] / 2)
    page.mouse.down()
    page.mouse.move(x, box["y"] + 60)
    scroll0 = page.evaluate("window.scrollY")
    page.mouse.move(x, 490)
    page.wait_for_timeout(1500)
    assert page.evaluate("window.scrollY") > scroll0 + 100
    page.mouse.up()
    after = _order(page, "ord1")
    assert after != before and after.index(before[0]) >= 2


def test_ranking_drag_hides_keep_order(page, survey_html):
    start(page, survey_html)
    assert page.locator("#card-rank .qm-keep-order").is_visible()
    _drag_first_to_end(page, "rank")
    assert page.locator("#card-rank .qm-keep-order").is_hidden()
    assert page.evaluate("window.fullmark.state().answers.rank") == {"order": [1, 2, 0]}


def test_ranking_starts_in_written_order_and_can_be_kept(page, survey_html):
    start(page, survey_html)
    items = page.locator("#card-rank .qm-order > li")
    assert items.evaluate_all("els => els.map(e => e.dataset.item)") == ["0", "1", "2"]
    assert page.evaluate("window.fullmark.state().answers.rank") is None
    page.locator("#card-rank .qm-keep-order").click()
    assert page.evaluate("window.fullmark.state().answers.rank") == {"order": [0, 1, 2]}
    assert page.locator("#card-rank .qm-keep-order").is_hidden()
    page.locator("#card-rank [data-dir='1']").first.click()
    assert page.evaluate("window.fullmark.state().answers.rank") == {"order": [1, 0, 2]}
    page.click("#submit-btn")
    page.click("#dlg-ok")
    lines = page.locator("#card-rank .qm-answer-list li").all_text_contents()
    assert lines == ["Exercise", "Sleep", "Study"]


def test_survey_works_with_storage_blocked(browser, survey_html):
    ctx = browser.new_context()
    ctx.add_init_script(
        "Object.defineProperty(window, 'localStorage', {get() { throw new DOMException('blocked', 'SecurityError'); }});"
    )
    pg = ctx.new_page()
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    quiz, _, _ = load_quiz(FIX / "survey.md")
    seen = []
    pg.on("request", lambda r: seen.append(r.url))
    pg.goto(survey_html.as_uri())
    pg.click("#start-btn")
    for q in quiz.questions:
        if q.id in SURVEY_ANSWERS:
            fill(pg, q, SURVEY_ANSWERS[q.id])
    pg.click("#submit-btn")
    pg.click("#dlg-ok")
    pg.wait_for_selector("#results")
    pg.click("#export-btn-2")
    assert pg.locator("#export-json").input_value().count('"mode": "survey"') == 1
    pg.reload()
    assert pg.locator("#start-btn").count() == 1
    assert not errors, errors
    assert [
        u for u in seen if not u.startswith("data:") and u != survey_html.as_uri()
    ] == []
    ctx.close()


def test_survey_has_no_horizontal_scroll_on_a_phone(browser, survey_html):
    ctx = browser.new_context(
        viewport={"width": 360, "height": 740}, is_mobile=True, device_scale_factor=2
    )
    pg = ctx.new_page()
    pg.goto(survey_html.as_uri())
    pg.click("#start-btn")
    pg.wait_for_selector(".qm-card")
    assert pg.evaluate("document.documentElement.scrollWidth") <= 360
    # the 0 to 10 scale still has tappable options
    sizes = pg.locator("#card-sleep .qm-scale-num").evaluate_all(
        "els => els.map(e => e.getBoundingClientRect().width)"
    )
    assert len(sizes) == 11 and min(sizes) >= 24
    ctx.close()


# ---------------------------------------------------------------- quiz serve


def _served_survey(tmp_path, **kw):
    from test_serve import Running

    src = tmp_path / "survey.md"
    src.write_text((FIX / "survey.md").read_text(encoding="utf-8"), encoding="utf-8")
    return src, Running(src, **kw)


def _finish_survey(page, url):
    quiz, _, _ = load_quiz(FIX / "survey.md")
    page.goto(url)
    page.click("#start-btn")
    page.wait_for_selector("#quiz-screen .qm-card")
    _answer_survey(page, quiz)
    page.click("#submit-btn")
    page.click("#dlg-ok")
    page.wait_for_selector("#results")


def test_served_survey_sends_answers_and_exits(page, tmp_path):
    _, srv = _served_survey(tmp_path)
    with srv:
        _finish_survey(page, srv.url)
        page.wait_for_selector("#send-status.qm-sent-ok")
        assert (
            "Answers sent. You can close this tab."
            in page.locator("#send-status").text_content()
        )
        assert page.locator("#export-btn-2").is_visible()  # the backup stays
        assert page.locator(".qm-export-hint").count() == 0
        assert srv.finish() == 0
    files = sorted(tmp_path.glob("*-results-*.json"))
    assert len(files) == 1
    saved = json.loads(files[0].read_text(encoding="utf-8"))
    validate_results(saved)
    assert saved["attempt"]["mode"] == "survey" and saved["attempt"]["submitted"]
    assert {q["id"]: q["response"] for q in saved["questions"]}["conf"] == {"value": 4}
    assert not page.errors


TINY_QUIZ = """---
title: Tiny
---

## Two plus two?

- [ ] 3
- [x] 4

> [!explanation]
> Two and two make four, by counting on from two.
"""


def test_served_quiz_mode_also_sends(page, tmp_path):
    from test_serve import Running

    src = tmp_path / "tiny.md"
    src.write_text(
        TINY_QUIZ,
        encoding="utf-8",
    )
    with Running(src) as srv:
        page.goto(srv.url)
        page.click("#start-btn")
        page.wait_for_selector("#quiz-screen .qm-card")
        page.click("#submit-btn")
        page.click("#dlg-ok")
        page.wait_for_selector("#send-status.qm-sent-ok")
        assert srv.finish() == 0
    (saved_file,) = tmp_path.glob("*-results-*.json")
    saved = json.loads(saved_file.read_text(encoding="utf-8"))
    validate_results(saved)
    assert saved["attempt"]["mode"] == "quiz"


def test_library_take_files_the_result_in_the_library(page, lib, capsys):
    from test_library import (
        RunningTake,
        calc,
        entry_of,
        make_library,
        reg_json,
        result_files,
        run,
    )

    library = make_library(capsys, lib)
    src = calc(lib)
    quiz, _, _ = load_quiz(src)
    assert reg_json(capsys, str(src), "-n", "calc")[0] == 0
    first = quiz.questions[0]
    with RunningTake("calc") as srv:
        page.goto(srv.url)
        page.click("#start-btn")
        page.wait_for_selector("#quiz-screen .qm-card")
        fill(page, first, correct_response(first, quiz))
        page.click("#submit-btn")
        page.click("#dlg-ok")
        page.wait_for_selector("#send-status.qm-sent-ok")
        assert srv.finish() == 0
    (saved_file,) = result_files(library, "calc")
    saved = json.loads(saved_file.read_text(encoding="utf-8"))
    validate_results(saved)
    assert saved["quiz"]["hash"] == entry_of(library, "calc")["current"]
    assert not page.errors
    capsys.readouterr()
    code, out, _ = run(capsys, "list", "--json")
    (row,) = json.loads(out)
    assert code == 0 and row["attempts"] == 1 and row["last_score"] is not None


def test_served_page_says_so_when_the_server_is_gone(page, tmp_path):
    _, srv = _served_survey(tmp_path)
    with srv:
        quiz, _, _ = load_quiz(FIX / "survey.md")
        page.goto(srv.url)
        page.click("#start-btn")
        page.wait_for_selector("#quiz-screen .qm-card")
        _answer_survey(page, quiz)
        srv.stop.set()
        srv.thread.join(10)
        assert not srv.thread.is_alive()
        page.click("#submit-btn")
        page.click("#dlg-ok")
        page.wait_for_selector("#send-status.qm-sent-fail")
        assert (
            "Could not send; use Export answers"
            in page.locator("#send-status").text_content()
        )
    assert list(tmp_path.glob("*-results-*.json")) == []
    # nothing is lost: the export still works and validates
    assert export_json(page)["attempt"]["submitted"]
    assert page.locator("#export-btn-2").is_visible()


def _wait_for(check, seconds=5.0):
    import time

    end = time.monotonic() + seconds
    while time.monotonic() < end:
        value = check()
        if value:
            return value
        time.sleep(0.05)
    return check()


def _saved_answers(prog):
    try:
        return json.loads(prog.read_text(encoding="utf-8"))["state"]["answers"]
    except (OSError, ValueError, KeyError):
        return {}


def test_autosave_resumes_in_a_new_browser_on_a_new_port(browser, tmp_path):
    prog = tmp_path / "progress.json"
    quiz, _, _ = load_quiz(FIX / "survey.md")
    first = {k: SURVEY_ANSWERS[k] for k in ("how", "name")}
    ctx = browser.new_context()
    pg = ctx.new_page()
    _, srv = _served_survey(tmp_path, autosave=str(prog), timeout=60)
    with srv:
        pg.goto(srv.url)
        pg.click("#start-btn")
        pg.wait_for_selector("#quiz-screen .qm-card")
        for q in quiz.questions:
            if q.id in first:
                fill(pg, q, first[q.id])
        assert _wait_for(lambda: set(_saved_answers(prog)) >= set(first))
    ctx.close()
    assert prog.exists()

    ctx = browser.new_context()  # empty localStorage: only the server copy can restore
    pg = ctx.new_page()
    _, srv = _served_survey(tmp_path, autosave=str(prog), timeout=60)
    with srv:
        pg.goto(srv.url)
        pg.wait_for_selector("#resume-btn")
        pg.click("#resume-btn")
        pg.wait_for_selector("#quiz-screen .qm-card")
        assert pg.locator("#progress").text_content() == "Answered 2/8"
        _answer_survey(pg, quiz)
        pg.click("#submit-btn")
        pg.click("#dlg-ok")
        pg.wait_for_selector("#send-status.qm-sent-ok")
        assert srv.finish() == 0
    ctx.close()
    (saved_file,) = tmp_path.glob("*-results-*.json")
    validate_results(json.loads(saved_file.read_text(encoding="utf-8")))
    assert not prog.exists()


def test_start_over_deletes_the_server_progress(browser, tmp_path):
    prog = tmp_path / "progress.json"
    quiz, _, _ = load_quiz(FIX / "survey.md")
    ctx = browser.new_context()
    pg = ctx.new_page()
    _, srv = _served_survey(tmp_path, autosave=str(prog), timeout=60)
    with srv:
        pg.goto(srv.url)
        pg.click("#start-btn")
        pg.wait_for_selector("#quiz-screen .qm-card")
        _answer_survey(pg, quiz)
        assert _wait_for(prog.exists)
        pg.reload()
        pg.click("#restart-btn")
        pg.click("#dlg-ok")
        pg.wait_for_selector("#start-btn")
        assert _wait_for(lambda: not prog.exists())
        pg.reload()
        assert pg.locator("#resume-btn").count() == 0
    ctx.close()


def test_page_from_disk_sends_nothing_and_shows_no_status(page, survey_html):
    quiz, _, _ = load_quiz(FIX / "survey.md")
    start(page, survey_html)
    _answer_survey(page, quiz)
    page.click("#submit-btn")
    page.click("#dlg-ok")
    page.wait_for_selector("#results")
    assert page.evaluate("typeof window.FULLMARK_SUBMIT") == "undefined"
    assert page.locator("#send-status").count() == 0
    assert "Export your answers" in page.locator("#results").text_content()


def test_display_menu_opens_and_closes(browser, kitchen_html):
    ctx = browser.new_context(viewport={"width": 375, "height": 800})
    pg = ctx.new_page()
    pg.goto(kitchen_html.as_uri())
    btn = pg.locator("#display-btn")
    # spelled out on the start screen, compact in the quiz header
    assert btn.inner_text() == btn.get_attribute("aria-label") == "Text size and theme"
    assert btn.get_attribute("aria-controls") == "display-pop"
    for where in ("start", "quiz"):
        if where == "quiz":
            pg.click("#start-btn")
            assert btn.inner_text() == "Aa"
            assert btn.get_attribute("aria-label") == "Display settings"
        assert btn.get_attribute("aria-expanded") == "false"
        assert pg.locator("#font-larger").is_hidden()
        btn.click()  # open, then close by toggling
        assert (
            btn.get_attribute("aria-expanded") == "true"
            and pg.locator("#font-larger").is_visible()
        )
        box = pg.locator("#display-pop").bounding_box()
        assert box["x"] >= 0 and box["x"] + box["width"] <= 375
        btn.click()
        assert pg.locator("#font-larger").is_hidden()
        btn.click()
        pg.keyboard.press("Escape")  # Escape closes and returns focus to the button
        assert pg.locator("#font-larger").is_hidden()
        assert pg.evaluate("document.activeElement.id") == "display-btn"
        btn.click()
        pg.mouse.click(5, 790)  # an outside click closes it
        assert pg.locator("#font-larger").is_hidden()
    ctx.close()


# ---------------------------------------------------------------- blank widths

_BLANKS_QUIZ = """---
title: Blank widths
---

## Fill in. {id=w1 type=blanks}

A is [[x]] and B is [[mitochondrion|mito]].
"""


def _blank_metrics(page, selector):
    """Width of the first matching blank, and of `ch` units in its font (px)."""
    return page.eval_on_selector(
        selector,
        """el => {
            const probe = document.createElement("span");
            probe.style.cssText = "position:absolute;visibility:hidden;width:100ch;font:" +
                getComputedStyle(el).font;
            el.parentNode.appendChild(probe);
            const ch = probe.getBoundingClientRect().width / 100;
            probe.remove();
            return { width: el.getBoundingClientRect().width, ch };
        }""",
    )


def test_blank_width_starts_at_bucket_grows_and_resets(page, tmp_path):
    src = tmp_path / "widths.md"
    src.write_text(_BLANKS_QUIZ, encoding="utf-8")
    start(page, build_to(tmp_path, src))
    blanks = page.locator("#card-w1 .qm-blank")
    first, second = blanks.nth(0), blanks.nth(1)
    # longest answer is 11 chars: bucket L (16ch); both blanks start equal
    assert "qm-blank-l" in first.get_attribute("class")
    assert "qm-blank-l" in second.get_attribute("class")
    sel = "#card-w1 .qm-blank >> nth=0"
    m0 = _blank_metrics(page, sel)
    w0, ch = m0["width"], m0["ch"]
    assert abs(first.bounding_box()["width"] - second.bounding_box()["width"]) < 0.5
    assert w0 >= 16 * ch - 0.5 and w0 < 17 * ch

    first.fill("abcdefghijklmnopqrstuvwxyz"[:22])
    w1 = first.bounding_box()["width"]
    assert w1 > w0 + 2 * ch
    assert abs(second.bounding_box()["width"] - w0) < 0.5

    first.fill("a" * 80)
    w2 = first.bounding_box()["width"]
    assert w2 > w1
    assert abs(w2 - 30 * ch) < 1  # stops at the max, 30ch

    first.fill("")
    assert abs(first.bounding_box()["width"] - w0) < 0.5
    assert page.errors == []


def test_blank_width_in_code_block_uses_same_buckets(page, rust_html):
    start(page, rust_html)
    inp = page.locator("pre.qm-code input.qm-blank").first
    cls = inp.get_attribute("class")
    assert re.search(r"qm-blank-(s|m|l|xl)", cls)
    before = inp.bounding_box()["width"]
    inp.fill("x" * 25)
    assert inp.bounding_box()["width"] > before


def test_header_shows_the_tool_version_only_in_a_wide_margin(browser, tmp_path):
    from fullmark import __version__

    html = build_to(tmp_path, FIX / "all-types.md", "brand.html")
    for width, shown in [(1600, True), (1280, False)]:
        ctx = browser.new_context(viewport={"width": width, "height": 800})
        pg = ctx.new_page()
        pg.goto(html.as_uri())
        pg.click("#start-btn")
        pg.wait_for_selector(".qm-card")
        brand = pg.locator(".qm-brand")
        assert brand.is_visible() == shown
        if shown:
            assert brand.text_content() == "fullmark " + __version__
            # it sits in the margin, left of the title, and never widens the page
            assert brand.bounding_box()["x"] >= 0
            assert (
                brand.bounding_box()["x"] + brand.bounding_box()["width"]
                < pg.locator(".qm-header-title").bounding_box()["x"]
            )
            assert pg.evaluate("document.documentElement.scrollWidth") <= width
        ctx.close()
