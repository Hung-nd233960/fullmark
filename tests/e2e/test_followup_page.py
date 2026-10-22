"""Follow-up text inputs on choices ({input}): reveal, focus, keep, export, lock."""

import pytest
from conftest import FIX, build_to
from helpers import fill, validate_results

from fullmark.validate import load_quiz

SRC = FIX / "followup.md"


@pytest.fixture(scope="module")
def followup_html(tmp_path_factory):
    return build_to(tmp_path_factory.mktemp("followup"), SRC)


def start(page, html):
    page.goto(html.as_uri())
    page.click("#start-btn")
    page.wait_for_selector("#quiz-screen .qm-card")


def choice(page, qid, value):
    return page.locator(f"#card-{qid} input[name='c-{qid}'][value='{value}']")


def row(page, qid, value):
    return page.locator(f"#card-{qid} #fu-{qid}-{value}-row")


def field(page, qid, value):
    return page.locator(f"#card-{qid} #fu-{qid}-{value}")


def focused(locator):
    return locator.evaluate("el => el === document.activeElement")


def test_input_is_stripped_from_the_choice_text_and_hidden_at_first(
    page, followup_html
):
    start(page, followup_html)
    assert "{input" not in page.locator("#card-capital").text_content()
    assert page.locator("#card-capital .qm-followup:visible").count() == 0
    assert page.locator("#card-plain .qm-followup").count() == 0


def test_picking_the_choice_reveals_a_labelled_input_and_focuses_it(
    page, followup_html
):
    start(page, followup_html)
    radio = choice(page, "capital", 2)
    assert radio.get_attribute("aria-expanded") is None  # not allowed on a radio
    radio.check()
    assert row(page, "capital", 2).is_visible()
    assert focused(field(page, "capital", 2))
    # a real label, with the default prompt
    assert page.locator("label[for='fu-capital-2']").text_content() == "Please specify"
    assert page.get_by_label("Please specify").count() == 1
    assert radio.get_attribute("aria-controls") == "fu-capital-2-row"
    # the row sits right under its choice
    assert radio.evaluate(
        "el => el.closest('label').nextElementSibling.id === 'fu-capital-2-row'"
    )


def test_text_is_kept_while_hidden_and_when_the_choice_comes_back(page, followup_html):
    start(page, followup_html)
    choice(page, "capital", 1).check()
    field(page, "capital", 1).fill("it is the capital")
    choice(page, "capital", 0).check()
    assert not row(page, "capital", 1).is_visible()
    choice(page, "capital", 1).check()
    assert row(page, "capital", 1).is_visible()
    assert field(page, "capital", 1).input_value() == "it is the capital"


def test_multi_shows_and_hides_per_checkbox(page, followup_html):
    start(page, followup_html)
    box = choice(page, "primes", 1)
    assert box.get_attribute("aria-expanded") == "false"
    assert box.get_attribute("aria-controls") == "fu-primes-1-row"
    box.check()
    assert row(page, "primes", 1).is_visible()
    assert box.get_attribute("aria-expanded") == "true"
    assert page.locator("label[for='fu-primes-1']").text_content() == "Name another"
    box.uncheck()
    assert not row(page, "primes", 1).is_visible()
    assert box.get_attribute("aria-expanded") == "false"


def test_arrows_keep_focus_on_the_radios_and_space_moves_into_the_field(
    page, followup_html
):
    start(page, followup_html)
    choice(page, "capital", 0).focus()
    page.keyboard.press("ArrowDown")  # selects Paris, which has a field
    assert choice(page, "capital", 1).is_checked()
    assert row(page, "capital", 1).is_visible()
    assert focused(choice(page, "capital", 1))
    page.keyboard.press("Tab")  # the field is next in the tab order
    assert focused(field(page, "capital", 1))
    page.keyboard.type("because")
    # a checkbox picked with Space sends focus into its field
    choice(page, "primes", 1).focus()
    page.keyboard.press("Space")
    assert focused(field(page, "primes", 1))
    assert not page.errors


def test_export_adds_inputs_only_for_selected_choices_and_validates(
    page, followup_html
):
    start(page, followup_html)
    choice(page, "capital", 2).check()
    field(page, "capital", 2).fill("  Berlin ")
    choice(page, "capital", 1).check()  # 2 is now hidden but keeps its text
    choice(page, "primes", 0).check()
    choice(page, "primes", 1).check()
    field(page, "primes", 1).fill("5")
    choice(page, "where", 2).check()
    field(page, "where", 2).fill("a hackathon")
    choice(page, "plain", 1).check()
    page.click("#submit-btn")
    page.click("#dlg-ok")
    page.wait_for_selector("#results")
    exported = page.evaluate("window.fullmark.buildExport()")
    validate_results(exported)
    resp = {q["id"]: q["response"] for q in exported["questions"]}
    assert resp["capital"] == {"choice": 1}  # hidden text is not an answer
    assert resp["primes"] == {"choices": [0, 1], "inputs": {"1": "5"}}
    assert resp["where"] == {"choice": 2, "inputs": {"2": "a hackathon"}}
    assert resp["plain"] == {"choice": 1}
    by_id = {q["id"]: q for q in exported["questions"]}
    assert by_id["capital"]["earned"] == 1 and by_id["primes"]["earned"] == 1
    assert by_id["where"]["status"] == "ungraded"
    # everything is locked after Finish, and the answer reads as "choice: text"
    assert (
        page.locator("#card-where :is(.qm-choice, .qm-followup) input:enabled").count()
        == 0
    )
    assert (
        "Other: a hackathon"
        in page.locator("#card-where .qm-your-answer").text_content()
    )
    assert not page.errors


def test_text_survives_a_reload_even_while_hidden(page, followup_html):
    start(page, followup_html)
    choice(page, "capital", 2).check()
    field(page, "capital", 2).fill("left over")
    choice(page, "capital", 0).check()
    choice(page, "where", 4).check()
    field(page, "where", 4).fill("Signals lab")
    page.evaluate("window.dispatchEvent(new Event('pagehide'))")
    page.reload()
    page.click("#resume-btn")
    page.wait_for_selector("#quiz-screen .qm-card")
    assert choice(page, "capital", 0).is_checked()
    assert not row(page, "capital", 2).is_visible()
    choice(page, "capital", 2).check()
    assert field(page, "capital", 2).input_value() == "left over"
    assert row(page, "where", 4).is_visible()
    assert field(page, "where", 4).input_value() == "Signals lab"


def test_shuffled_choices_keep_their_input(browser, followup_html):
    for _ in range(6):
        ctx = browser.new_context()
        pg = ctx.new_page()
        start(pg, followup_html)
        rows = pg.locator("#card-where .qm-followup")
        assert rows.count() == 2
        for i in range(2):
            ok = rows.nth(i).evaluate(
                """el => {
                  const lab = el.previousElementSibling;
                  const v = el._choice.value;
                  return lab.classList.contains('qm-choice') && lab.querySelector('input').value === v
                    && el.querySelector('input').dataset.followup === v;
                }"""
            )
            assert ok
        ctx.close()


def test_works_with_storage_blocked(browser, followup_html):
    ctx = browser.new_context()
    ctx.add_init_script(
        "Object.defineProperty(window, 'localStorage', {get() { throw new DOMException('blocked', 'SecurityError'); }});"
    )
    pg = ctx.new_page()
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    start(pg, followup_html)
    quiz, _, _ = load_quiz(SRC)
    assert quiz is not None
    fill(pg, quiz.questions[0], {"choice": 2, "inputs": {"2": "typed"}})
    assert pg.locator("#fu-capital-2").input_value() == "typed"
    resp = pg.evaluate("window.fullmark.buildExport().questions[0].response")
    assert resp["inputs"] == {"2": "typed"}
    assert not errors, errors
    ctx.close()


@pytest.mark.parametrize("scheme", ["light", "dark"])
def test_phone_width_has_no_horizontal_scroll(browser, followup_html, scheme):
    ctx = browser.new_context(
        viewport={"width": 360, "height": 740}, color_scheme=scheme
    )
    pg = ctx.new_page()
    start(pg, followup_html)
    choice(pg, "capital", 2).check()
    fld = field(pg, "capital", 2)
    fld.fill("a rather long answer that goes on and on and on past the edge of a phone")
    box = fld.bounding_box()
    assert box["x"] >= 0 and box["x"] + box["width"] <= 360
    assert pg.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
    ctx.close()
