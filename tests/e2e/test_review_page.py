"""quiz review in a real browser: fill cards, Finish, read review.json; axe on the form."""

import json
import shutil
from pathlib import Path

import pytest
from helpers import SCHEMAS
from jsonschema import Draft202012Validator
from test_accessibility import audit
from test_review import Running

from fullmark.build import build_html
from fullmark.review import make_form
from fullmark.validate import load_quiz

EXAMPLES = Path(__file__).parent.parent.parent / "src" / "fullmark" / "examples"
SCHEMA = json.loads((SCHEMAS / "review-v1.schema.json").read_text(encoding="utf-8"))


def calculus(tmp_path) -> Path:
    shutil.copytree(EXAMPLES / "assets", tmp_path / "assets")
    src = tmp_path / "calculus.md"
    shutil.copyfile(EXAMPLES / "calculus-1.md", src)
    return src


def verdict(page, qid, index):
    page.locator(
        f"#card-{qid}-verdict input[name='c-{qid}-verdict'][value='{index}']"
    ).check()


def test_fix_and_drop_cards_are_written_to_review_json(page, tmp_path):
    src = calculus(tmp_path)
    with Running(src) as srv:
        page.goto(srv.url)
        assert "Review: Calculus" in page.title()
        page.click("#start-btn")
        page.wait_for_selector("#quiz-screen .qm-card")
        # the question is shown as rendered, with its key, above the three inputs
        assert page.locator(".qm-katex, .katex").count() > 0
        assert "Answer key" in page.locator("#quiz-screen").first.text_content()
        # card 1: Fix, with text, and a problem and a note
        verdict(page, "q1", 1)
        page.locator("#card-q1-verdict .qm-followup-input[data-followup='1']").fill(
            "the limit is 1, say why"
        )
        page.locator("#card-q1-problems input[value='0']").check()
        page.locator("#card-q1-note .qm-input").fill("see lecture 2")
        # card 2: Drop
        verdict(page, "q2", 2)
        page.locator("#card-q2-verdict .qm-followup-input[data-followup='2']").fill(
            "not covered"
        )
        page.click("#submit-btn")
        page.click("#dlg-ok")
        page.wait_for_selector("#send-status.qm-sent-ok")
        assert srv.finish() == 0
    assert not page.errors
    doc = json.loads((tmp_path / "review.json").read_text(encoding="utf-8"))
    Draft202012Validator(SCHEMA).validate(doc)
    assert sorted(doc["items"]) == ["q1", "q2"]  # the other cards were left unreviewed
    q1, q2 = doc["items"]["q1"], doc["items"]["q2"]
    assert (q1["verdict"], q1["text"], q1["problems"], q1["note"]) == (
        "fix",
        "the limit is 1, say why",
        ["key-wrong"],
        "see lecture 2",
    )
    assert (q2["verdict"], q2["text"]) == ("drop", "not covered")
    assert not list(tmp_path.glob("*-results-*.json"))


@pytest.mark.parametrize("scheme", ["light", "dark"])
@pytest.mark.parametrize(
    "name", ["calculus-1.md", "rust-basics.md", "medical-physiology.md"]
)
def test_review_page_has_no_serious_accessibility_violations(
    browser, scheme, name, tmp_path
):
    shutil.copytree(EXAMPLES / "assets", tmp_path / "assets")
    src = tmp_path / "q.md"
    shutil.copyfile(EXAMPLES / name, src)
    quiz, _, _ = load_quiz(src)
    assert quiz is not None
    form, findings, _ = make_form(quiz, tmp_path)
    assert form is not None and not findings.has_errors
    html = tmp_path / "form.html"
    html.write_text(build_html(form, tmp_path).html, encoding="utf-8")
    ctx = browser.new_context(
        viewport={"width": 1000, "height": 900}, color_scheme=scheme
    )
    pg = ctx.new_page()
    pg.goto(html.as_uri())
    audit(pg, f"review/{name}/{scheme} start")
    pg.click("#start-btn")
    pg.wait_for_selector(".qm-card")
    audit(pg, f"review/{name}/{scheme} cards")
    verdict(pg, quiz.questions[0].id, 1)
    audit(pg, f"review/{name}/{scheme} fix chosen")
    ctx.close()


def form_html(tmp_path) -> Path:
    src = calculus(tmp_path)
    quiz, _, _ = load_quiz(src)
    assert quiz is not None
    form, findings, _ = make_form(quiz, tmp_path)
    assert form is not None and not findings.has_errors
    out = tmp_path / "form.html"
    out.write_text(build_html(form, tmp_path).html, encoding="utf-8")
    return out


def test_review_page_counts_cards_not_fields(page, tmp_path):
    out = form_html(tmp_path)
    quiz, _, _ = load_quiz(tmp_path / "calculus.md")
    assert quiz is not None
    n = len(quiz.questions)
    page.goto(out.as_uri())
    page.click("#start-btn")
    page.wait_for_selector("#quiz-screen .qm-card")
    assert page.locator(".qm-card").count() == 3 * n
    assert page.locator("#progress").text_content() == f"Reviewed 0/{n}"
    pills = page.locator(".qm-nav .qm-pill")
    assert pills.count() == n
    assert pills.all_text_contents() == [str(i) for i in range(1, n + 1)]
    # no flag boxes on a review form
    assert page.locator(".qm-flag").count() == 0
    # problems and note alone do not review a card
    page.locator("#card-q1-problems input[value='0']").check()
    page.locator("#card-q1-note .qm-input").fill("hm")
    assert page.locator("#progress").text_content() == f"Reviewed 0/{n}"
    assert page.locator(".qm-nav .qm-pill.answered").count() == 0
    verdict(page, "q1", 0)
    assert page.locator("#progress").text_content() == f"Reviewed 1/{n}"
    assert page.locator(".qm-nav .qm-pill.answered").all_text_contents() == ["1"]
    # Finish warns about cards without a verdict
    page.click("#submit-btn")
    msg = page.locator("dialog.qm-dialog p").first.text_content()
    assert f"{n - 1} review cards without a verdict" in msg
    assert not page.errors


def test_normal_survey_keeps_flags_and_field_counts(page, tmp_path):
    src = tmp_path / "s.md"
    src.write_text(
        "---\ntitle: S\nmode: survey\n---\n\n## One {id=a}\n\n- [ ] x\n- [ ] y\n\n"
        "## Two {type=short id=b}\n",
        encoding="utf-8",
    )
    quiz, findings, _ = load_quiz(src)
    assert quiz is not None and not findings.has_errors
    out = tmp_path / "s.html"
    out.write_text(build_html(quiz, tmp_path).html, encoding="utf-8")
    page.goto(out.as_uri())
    page.click("#start-btn")
    page.wait_for_selector("#quiz-screen .qm-card")
    assert page.locator(".qm-flag").count() == 2
    assert page.locator("#progress").text_content() == "Answered 0/2"
    page.locator("#card-a input[value='0']").check()
    assert page.locator("#progress").text_content() == "Answered 1/2"
    assert page.locator(".qm-nav .qm-pill").count() == 2
