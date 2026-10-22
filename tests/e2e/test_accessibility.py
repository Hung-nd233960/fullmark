"""axe-core audit: no serious or critical violations in either color scheme.

axe-core 4.10.2 (tests/vendor/axe.min.js) is used by the tests only; it is not shipped.
"""

from pathlib import Path

import pytest
from conftest import FIX, build_to
from helpers import correct_response, fill

from fullmark.validate import load_quiz

AXE = Path(__file__).parent.parent / "vendor" / "axe.min.js"

EXAMPLES = Path(__file__).parent.parent.parent / "src" / "fullmark" / "examples"
SOURCES = {
    "calculus": EXAMPLES / "calculus-1.md",
    "rust": EXAMPLES / "rust-basics.md",
    "ielts": EXAMPLES / "ielts-writing.md",
    "kitchen": FIX / "all-types.md",
    "survey": FIX / "survey.md",
    "survey-example": EXAMPLES / "survey.md",
    "mixed": FIX / "mixed.md",
    "followup": FIX / "followup.md",
}

# one answer per question, enough to reach the results screen of the ungraded fixtures
UNGRADED_ANSWERS = {
    "survey": {
        "how": {"choice": 1},
        "help": {"choices": [0]},
        "name": {"text": "Sam"},
        "details": {"fields": ["Signals", "3"]},
        "conf": {"value": 4},
        "sleep": {"value": 7},
        "more": {"text": "Nothing else."},
    },
    "survey-example": {
        "where": {"choice": 0},
        "prepare": {"choice": 1},
        "tools": {"choices": [0, 1]},
        "rank": {"order": [1, 0, 2, 3]},
        "confidence": {"value": 3},
        "days": {"value": 5},
        "routine": {"fields": ["Evening", "6"]},
        "ideas": {"text": "More quiet rooms."},
    },
    "followup": {
        "capital": {"choice": 2, "inputs": {"2": "Berlin"}},
        "primes": {"choices": [0, 1], "inputs": {"1": "5"}},
        "where": {"choice": 2, "inputs": {"2": "the library"}},
        "plain": {"choice": 1},
    },
    "mixed": {
        "sum": {"choice": 1},
        "sure": {"value": 3},
        "why": {"text": "Because."},
        "colour": {"choice": 2},
        "fr": {"text": "Lyon"},
    },
}

# rule id -> why it is accepted. Keep this empty unless a reason is written down.
ACCEPTED: dict[str, str] = {}


def audit(page, where: str) -> None:
    page.add_script_tag(path=str(AXE))
    found = page.evaluate(
        """async () => {
          const r = await axe.run(document, { resultTypes: ['violations'] });
          return r.violations
            .filter(v => v.impact === 'serious' || v.impact === 'critical')
            .map(v => ({ id: v.id, impact: v.impact, help: v.help,
                         nodes: v.nodes.slice(0, 3).map(n => n.target.join(' ')) }));
        }"""
    )
    found = [v for v in found if v["id"] not in ACCEPTED]
    assert not found, f"{where}: {found}"


@pytest.mark.parametrize("scheme", ["light", "dark"])
@pytest.mark.parametrize("which", list(SOURCES))
def test_no_serious_accessibility_violations(browser, scheme, which, tmp_path):
    html = build_to(tmp_path, SOURCES[which])
    ctx = browser.new_context(
        viewport={"width": 1000, "height": 900}, color_scheme=scheme
    )
    pg = ctx.new_page()
    pg.goto(html.as_uri())
    audit(pg, f"{which}/{scheme} start screen")
    pg.click("#start-btn")
    pg.wait_for_selector(".qm-card")
    audit(pg, f"{which}/{scheme} quiz")
    if which == "kitchen":
        quiz, _, _ = load_quiz(FIX / "all-types.md")
        for q in quiz.questions:
            fill(pg, q, correct_response(q, quiz))
        pg.click("#submit-btn")
        pg.click("#dlg-ok")
        pg.wait_for_selector("#results")
        audit(pg, f"{which}/{scheme} results")
    if which in UNGRADED_ANSWERS:
        quiz, _, _ = load_quiz(SOURCES[which])
        for q in quiz.questions:
            if q.id in UNGRADED_ANSWERS[which]:
                fill(pg, q, UNGRADED_ANSWERS[which][q.id])
        audit(pg, f"{which}/{scheme} answered")
        pg.click("#submit-btn")
        pg.click("#dlg-ok")
        pg.wait_for_selector("#results")
        audit(pg, f"{which}/{scheme} results")
    ctx.close()


def test_math_only_choices_get_a_readable_name(browser, tmp_path):
    html = build_to(tmp_path, SOURCES["calculus"])
    pg = browser.new_page()
    pg.goto(html.as_uri())
    pg.click("#start-btn")
    pg.wait_for_selector(".qm-card")
    names = pg.locator("#card-q1 .qm-choice input").evaluate_all(
        "els => els.map(e => e.getAttribute('aria-label'))"
    )
    assert names == ["0", "1", "2"] or all(
        n and "katex" not in n.lower() for n in names
    )
    assert all(names)
    pg.close()


@pytest.mark.parametrize("scheme", ["light", "dark"])
def test_panel_states_and_focus_mode_pass_axe(browser, scheme, tmp_path):
    """Wide panel with every pill state after submit, then Focus mode (fullscreen stubbed)."""
    from helpers import wrong_response
    from test_panel import stub

    html = build_to(tmp_path, FIX / "all-types.md")
    quiz, _, _ = load_quiz(FIX / "all-types.md")
    assert quiz is not None
    ctx = browser.new_context(
        viewport={"width": 1280, "height": 800}, color_scheme=scheme
    )
    pg = ctx.new_page()
    pg.add_init_script(stub(True, False))
    pg.goto(html.as_uri())
    pg.click("#start-btn")
    pg.wait_for_selector(".qm-card")
    for i, q in enumerate(quiz.questions[:8]):
        if q.type in ("essay", "code") or i % 2 == 0:
            fill(pg, q, correct_response(q, quiz))
        else:
            fill(pg, q, wrong_response(q, quiz))
    pg.click("#focus-btn")
    pg.wait_for_selector("body.qm-focus")
    audit(pg, f"panel/{scheme} focus mode")
    pg.click("#submit-btn")
    pg.click("#dlg-ok")
    pg.wait_for_selector("#results")
    audit(pg, f"panel/{scheme} focus mode, submitted")
    pg.click("#focus-btn")
    pg.set_viewport_size({"width": 400, "height": 800})
    pg.wait_for_selector(
        ".qm-header #progress", state="attached"
    )  # moved on the change event
    audit(pg, f"panel/{scheme} narrow, submitted")
    ctx.close()
