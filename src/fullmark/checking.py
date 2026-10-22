"""The findings behind `quiz check`, as a function the library can reuse too."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from .brief import brief_findings
from .models import Findings, Quiz
from .review import ReviewError, load_review, review_findings
from .validate import load_quiz


@dataclass
class CheckResult:
    quiz: Quiz | None
    findings: Findings
    text: str
    error: str | None = None  # a usage or I/O problem, worded as `quiz check` prints it


def check_file(path: Path, review_path: Path | str | None = None) -> CheckResult:
    """Parse and validate `path`, then add the review and brief findings."""
    path = Path(path)
    if not path.is_file():
        return CheckResult(None, Findings(path.name), "", f"no such file: {path}")
    try:
        quiz, findings, text = load_quiz(path)
    except (OSError, UnicodeDecodeError) as exc:
        return CheckResult(None, Findings(path.name), "", f"cannot read {path}: {exc}")
    if review_path:
        try:
            review_doc = load_review(Path(review_path))
        except ReviewError as exc:
            return CheckResult(quiz, findings, text, str(exc))
        if quiz is not None:
            if review_doc["quiz"].get("id") not in (None, quiz.id):
                return CheckResult(
                    quiz,
                    findings,
                    text,
                    f"{review_path} is a review of quiz "
                    f"{review_doc['quiz'].get('id')!r}, not {quiz.id!r}",
                )
            findings.extend(review_findings(quiz, text, review_doc, path.name))
    if quiz is not None:  # a brief.yaml beside the quiz adds warnings (brief.*)
        findings.extend(brief_findings(path.parent, quiz, text, path.name))
    return CheckResult(quiz, findings, text)
