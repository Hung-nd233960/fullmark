"""The job behind `quiz grade`: grade one results file and write the report."""

from __future__ import annotations

import json
import sys
from collections.abc import Sequence
from pathlib import Path

from .grades import GradesError, load_grades
from .grades import template as grades_template
from .report import ResultsError, load_results, make_report, make_report_json
from .validate import load_quiz


def run_grade(
    results_path: Path,
    quiz_path: Path | None,
    grades_path: Path | None,
    as_json: bool,
    output: Path | None,
    template_dir: Path | None = None,
    prog: str = "quiz grade",
    beside: bool = True,
    extra_warnings: Sequence[str] = (),
) -> int:
    """Grade `results_path` and write the report. Returns the exit code.

    `quiz_path` is the quiz source (it must exist). With None and `beside` true, the
    source named in the results is looked for next to them. `template_dir` is where the
    grades template goes (default: next to the results). `prog` prefixes messages.
    `extra_warnings` are reported first."""
    rpath = Path(results_path)
    try:
        results = load_results(rpath)
    except ResultsError as exc:
        print(f"{prog}: {exc}", file=sys.stderr)
        return 2
    warnings: list[str] = list(extra_warnings)
    quiz = None
    if quiz_path is not None:
        qpath = Path(quiz_path)
        if not qpath.is_file():
            print(f"{prog}: no such quiz file: {qpath}", file=sys.stderr)
            return 2
    elif beside:
        qpath = rpath.parent / str(results["quiz"].get("source_file") or "")
    else:
        qpath = None
    if qpath is not None and qpath.is_file():
        quiz, findings, _ = load_quiz(qpath)
        if findings.has_errors or quiz is None:
            for f in findings.sorted():
                print(f.format(), file=sys.stderr)
            print(
                f"{prog}: the quiz source has errors; fix them or grade without --quiz",
                file=sys.stderr,
            )
            return 1
        if quiz.source_hash != results["quiz"].get("hash"):
            warnings.append(
                f"{qpath.name} changed after the attempt (hash {quiz.source_hash}, "
                f"results were made with {results['quiz'].get('hash')}); the re-grade may not match"
            )
    elif quiz_path is None and beside and qpath is not None:
        warnings.append(
            f"quiz source {qpath.name!r} not found next to the results; using the browser's grades"
        )
    grades = None
    if grades_path:
        try:
            grades = load_grades(Path(grades_path))
        except GradesError as exc:
            print(f"{prog}: {exc}", file=sys.stderr)
            return 2
    try:
        if as_json:
            data = make_report_json(results, quiz, warnings, grades)
            report = json.dumps(data, indent=2, ensure_ascii=False) + "\n"
            suffix = "-report.json"
        else:
            report = make_report(results, quiz, warnings, grades)
            suffix = "-report.md"
    except GradesError as exc:
        for problem in exc.problems:
            print(f"{prog}: {grades_path}: {problem}", file=sys.stderr)
        return 1
    out = Path(output) if output else rpath.with_name(rpath.stem + suffix)
    out.write_text(report, encoding="utf-8", newline="\n")
    if as_json and grades is None:
        todo = [
            (q["id"], q["ai_grading"]["criteria"])
            for q in data["questions"]
            if q["needs_ai_grading"]
        ]
        folder = Path(template_dir) if template_dir else rpath.parent
        tpl = folder / (rpath.stem + "-grades.json")
        if todo and not tpl.exists():
            tpl.write_text(
                json.dumps(grades_template(results, todo), indent=2, ensure_ascii=False)
                + "\n",
                encoding="utf-8",
                newline="\n",
            )
            print(f"wrote {tpl} (fill it in, then run again with --grades)")
    for w in warnings:
        print(f"warning: {w}", file=sys.stderr)
    print(f"wrote {out}")
    return 0
