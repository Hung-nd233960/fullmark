"""Command-line interface for fullmark."""

import argparse
import json
import sys
import tempfile
import time
import webbrowser
from collections import Counter
from pathlib import Path

from . import __version__
from .brief import (
    EXIT_NEEDS_INPUT,
    RESULTS_GLOB,
    SURVEY_ID,
    answers_from_results,
    load_brief,
    load_questions,
    needs_input,
    parse_value,
    resolve,
    show_value,
    survey_markdown,
    to_brief,
    weak_topics,
    write_brief_files,
)
from .brief import (
    ResultsError as BriefResultsError,
)
from .build import build_html
from .checking import check_file
from .grade_run import run_grade
from .inspect_quiz import inspect_quiz, render_inspect
from .report import ResultsError
from .review import (
    ReviewError,
    block_hashes,
    items_from_results,
    load_review,
    make_form,
    merge,
    missing_ids,
    new_review,
    unseen,
    write_review,
)
from .review import counts as review_counts
from .serve import (
    ReloadServer,
    default_out,
    quiz_meta_of_html,
    serve_loop,
    unique_path,
)
from .stats import collect as collect_stats
from .stats import render as render_stats
from .templates_cmd import (
    agent_guide_text,
    guide_text,
    list_templates,
    new_from_template,
)
from .validate import load_quiz, load_quiz_text


def _stub(name: str):
    def run(args: argparse.Namespace) -> int:
        print(f"quiz {name}: not implemented yet", file=sys.stderr)
        return 2

    return run


def cmd_check(args: argparse.Namespace) -> int:
    result = check_file(Path(args.file), args.review)
    if result.error:
        print(f"quiz check: {result.error}", file=sys.stderr)
        return 2
    findings = result.findings
    items = findings.sorted()
    if args.json:
        print(json.dumps([f.as_dict() for f in items], indent=2, ensure_ascii=False))
    else:
        for f in items:
            print(f.format())
        n = Counter(f.severity for f in items)
        extra = f", {n['info']} info" if n["info"] else ""
        print(
            f"{n['error']} error(s), {n['warning']} warning(s){extra}", file=sys.stderr
        )
    if findings.has_errors:
        return 1
    if args.strict and any(f.severity == "warning" for f in items):
        print("quiz check: --strict treats warnings as errors", file=sys.stderr)
        return 1
    return 0


def cmd_build(args: argparse.Namespace) -> int:
    path = Path(args.file)
    if not path.is_file():
        print(f"quiz build: no such file: {path}", file=sys.stderr)
        return 2
    quiz, findings, _ = load_quiz(path)
    for f in findings.sorted():
        print(f.format())
    if findings.has_errors or quiz is None:
        print("quiz build: fix the errors above first", file=sys.stderr)
        return 1
    result = build_html(quiz, path.parent)
    for w in result.warnings:
        print(f"{path.name}: warning: {w}")
    if result.errors:
        for e in result.errors:
            print(f"{path.name}: error: {e}")
        return 1
    if args.strict and (len(findings) or result.warnings):
        print(
            "quiz build: --strict treats warnings as errors; nothing written",
            file=sys.stderr,
        )
        return 1
    out = Path(args.output) if args.output else path.with_suffix(".html")
    out.write_text(result.html, encoding="utf-8", newline="\n")
    print(f"wrote {out} ({result.size / 1024:.0f} KB)")
    if args.open:
        webbrowser.open(out.resolve().as_uri())
    return 0


def _signature(path: Path) -> tuple:
    """Changes whenever the quiz file or anything under its assets/ folder changes."""
    files = [path]
    assets = path.parent / "assets"
    if assets.is_dir():
        files += sorted(p for p in assets.rglob("*") if p.is_file())
    sig = []
    for f in files:
        try:
            st = f.stat()
            sig.append((str(f), st.st_mtime_ns, st.st_size))
        except OSError:
            sig.append((str(f), 0, 0))  # briefly missing while an editor saves
    return tuple(sig)


def watch(
    args: argparse.Namespace,
    interval: float = 0.5,
    should_stop=lambda: False,
    ready=None,
) -> int:
    """Rebuild whenever the quiz or its assets change. Keeps the last good HTML on errors.

    With args.serve, also serve the page locally and reload it after each rebuild;
    `ready(url)` is called once the server is up."""
    path = Path(args.file)
    if not path.is_file():
        print(f"quiz watch: no such file: {path}", file=sys.stderr)
        return 2
    serve = getattr(args, "serve", False)
    build_args = argparse.Namespace(
        file=args.file,
        output=args.output,
        open=args.open and not serve,
        strict=False,
    )
    seen = None
    first = True
    server = None
    if serve:
        out = Path(args.output) if args.output else path.with_suffix(".html")
        server = ReloadServer(out)
        server.start()
        print(
            f"watching {path}; serving {server.url} (the page reloads after each rebuild)"
        )
        if ready:
            ready(server.url)
    else:
        print(f"watching {path} (Ctrl+C to stop; reload the page after each rebuild)")
    try:
        while not should_stop():
            sig = _signature(path)
            if sig != seen:
                seen = sig
                ok = cmd_build(build_args) == 0
                if ok and server:
                    server.rebuilt()
                    if first and args.open:
                        webbrowser.open(server.url)
                if first:
                    first = False
                    build_args.open = False  # open the browser once only
                if not ok:
                    print(
                        "quiz watch: kept the previous build; waiting for the next save"
                    )
            time.sleep(interval)
    finally:
        if server:
            server.stop()
    return 0


def cmd_watch(args: argparse.Namespace) -> int:
    try:
        return watch(args, args.interval)
    except KeyboardInterrupt:
        print("stopped")
        return 0


def serve(args: argparse.Namespace, should_stop=lambda: False, ready=None) -> int:
    """`quiz serve`: serve the page once and write the results it posts back.

    `ready(url)` is called once the server is up (tests use it)."""
    path = Path(args.file)
    if not path.is_file():
        print(f"quiz serve: no such file: {path}", file=sys.stderr)
        return 2
    info = sys.stderr if args.json else sys.stdout
    try:
        if path.suffix.lower() in (".html", ".htm"):
            html = path.read_text(encoding="utf-8")
            meta = quiz_meta_of_html(html)
            if meta is None or meta.get("id") is None:
                print(f"quiz serve: {path} is not a fullmark page", file=sys.stderr)
                return 2
            quiz_id, quiz_hash = meta["id"], meta.get("hash")
        else:
            quiz, findings, _ = load_quiz(path)
            for f in findings.sorted():
                print(f.format(), file=info)
            if findings.has_errors or quiz is None:
                print("quiz serve: fix the errors above first", file=sys.stderr)
                return 1
            result = build_html(quiz, path.parent)
            if result.errors:
                for e in result.errors:
                    print(f"{path.name}: error: {e}", file=sys.stderr)
                return 1
            html, quiz_id, quiz_hash = result.html, quiz.id, quiz.source_hash
    except (OSError, UnicodeDecodeError) as exc:
        print(f"quiz serve: cannot read {path}: {exc}", file=sys.stderr)
        return 2
    out = Path(args.out) if args.out else default_out(path, quiz_id)
    try:
        server, status = serve_loop(
            html, quiz_id, out, args, info, should_stop, ready, quiz_hash=quiz_hash
        )
    except OSError as exc:
        print(
            f"quiz serve: cannot listen on 127.0.0.1:{args.port}: {exc}",
            file=sys.stderr,
        )
        return 2
    if status == "timeout":
        print(
            f"quiz serve: no answers arrived within {args.timeout:g} s", file=sys.stderr
        )
    if args.json:
        last = server.paths[-1] if server.paths else None
        outcome = {
            "status": status,
            "path": str(last) if last else None,
            "paths": [str(p) for p in server.paths],
        }
        print(json.dumps(outcome))
    return 0 if server.paths else 2


def cmd_serve(args: argparse.Namespace) -> int:
    return serve(args)


def review(args: argparse.Namespace, should_stop=lambda: False, ready=None) -> int:
    """`quiz review`: serve a review form for a quiz and write review.json from the answers.

    `ready(url)` is called once the server is up (tests use it)."""
    path = Path(args.file)
    if not path.is_file():
        print(f"quiz review: no such file: {path}", file=sys.stderr)
        return 2
    if args.tui:
        print(
            "quiz review: terminal form not built yet; use the web form",
            file=sys.stderr,
        )
        return 2
    info = sys.stderr if args.json else sys.stdout
    try:
        quiz, findings, text = load_quiz(path)
    except (OSError, UnicodeDecodeError) as exc:
        print(f"quiz review: cannot read {path}: {exc}", file=sys.stderr)
        return 2
    for f in findings.sorted():
        print(f.format(), file=info)
    if findings.has_errors or quiz is None:
        print("quiz review: fix the errors above first", file=sys.stderr)
        return 1
    since = None
    if args.since:
        try:
            since = load_review(Path(args.since))
        except ReviewError as exc:
            print(f"quiz review: {exc}", file=sys.stderr)
            return 2
    only = unseen(quiz, text, since) if since else None
    if only is not None and not only:
        print("quiz review: nothing is new or changed since that review", file=info)
        if args.json:
            print(json.dumps({"status": "nothing", "path": args.since}))
        return 0
    loose = missing_ids(quiz, text)
    if loose:
        print(
            f"quiz review: warning: {len(loose)} question(s) have no explicit "
            "{id=...}; a review finds them again only by their text. "
            "Consider adding ids.",
            file=info,
        )
    # merge into --out or the --since file; otherwise write a new file, never over one
    explicit = Path(args.out) if args.out else Path(args.since) if args.since else None
    out = explicit or path.with_name("review.json")
    try:
        if explicit and explicit.exists():
            review_doc = load_review(explicit)
        else:
            review_doc = since or new_review(quiz)
            out = unique_path(out)
    except ReviewError as exc:
        print(f"quiz review: {exc}", file=sys.stderr)
        return 2

    # the form: a survey made in memory, parsed and built like any quiz
    form, form_findings, _ = make_form(quiz, path.parent, only)
    if form is None or form_findings.has_errors:
        for f in form_findings.sorted():
            print(f.format(), file=sys.stderr)
        print("quiz review: could not build the review form (a bug)", file=sys.stderr)
        return 2
    result = build_html(form, path.parent)
    if result.errors:
        for e in result.errors:
            print(f"{path.name}: error: {e}", file=sys.stderr)
        return 1

    hashes = block_hashes(quiz, text)
    state: dict = {"doc": review_doc, "new": {}, "skipped": 0, "wrote": False}

    def absorb(results_path: Path) -> None:
        results = json.loads(results_path.read_text(encoding="utf-8"))
        items, skipped = items_from_results(results, quiz, hashes)
        state["doc"] = merge(state["doc"], items, quiz)
        state["new"].update(items)
        state["skipped"] += skipped
        write_review(out, state["doc"])
        state["wrote"] = True
        print(
            f"wrote {out} ({len(items)} reviewed, {skipped} without a verdict)",
            file=info,
            flush=True,
        )

    with tempfile.TemporaryDirectory(prefix="fullmark-review-") as tmp:
        try:
            _, status = serve_loop(
                result.html,
                form.id,
                Path(tmp) / "results.json",
                args,
                info,
                should_stop,
                ready,
                absorb,
            )
        except OSError as exc:
            print(
                f"quiz review: cannot listen on 127.0.0.1:{args.port}: {exc}",
                file=sys.stderr,
            )
            return 2
    if status == "timeout":
        print(
            f"quiz review: no answers arrived within {args.timeout:g} s",
            file=sys.stderr,
        )
    if args.json:
        flagged = [
            {"id": qid, **{k: it[k] for k in ("verdict", "text", "problems", "note")}}
            for qid, it in state["new"].items()
            if it["verdict"] != "keep" or it["problems"] or it["note"]
        ]
        outcome = {
            "status": status,
            "path": str(out) if state["wrote"] else None,
            "counts": review_counts(quiz, text, state["doc"])
            if state["wrote"]
            else None,
            "without_verdict": state["skipped"],
            "flagged": flagged,
        }
        print(json.dumps(outcome, ensure_ascii=False))
    return 0 if state["wrote"] else 2


def cmd_review(args: argparse.Namespace) -> int:
    return review(args)


def _flag_type(q):
    def convert(raw: str):
        try:
            return parse_value(q, raw)
        except ValueError as exc:
            raise argparse.ArgumentTypeError(str(exc).split(": ", 1)[-1]) from None

    convert.__name__ = q.id
    return convert


def _flag_help(q) -> str:
    text = q.help.rstrip(".") + "."
    if q.type in ("choice", "multi"):
        text += " One of: " + ", ".join(q.values) + "."
    if q.type == "multi":
        text += " Comma list, or 'none'."
    if q.dynamic:
        text += f" Default: {q.default}, but {q.dynamic}."
    elif not q.delegable:
        text += " Required (exit 3 when missing)."
        if q.default is not None:
            text += f" --accept-defaults gives it the default {show_value(q.default)}."
    elif q.default in ("", [], None):
        text += " Optional."
    else:
        text += f" Default: {show_value(q.default)}."
    return text


def brief(args: argparse.Namespace, should_stop=lambda: False, ready=None) -> int:
    """`quiz brief DIR`: write brief.yaml and content/ for an agent to pick up.

    Exit codes: 0 done, 2 usage error or timeout, 3 a human-only value is missing
    (nothing is written). `ready(url)` is called once the --web form is up."""

    def fail(message: str, code: int = 2) -> int:
        print(f"quiz brief: {message}", file=sys.stderr)
        return code

    folder = Path(args.dir)
    questions = load_questions()
    given = {
        q.id: getattr(args, q.dest)
        for q in questions
        if getattr(args, q.dest) is not None
    }
    for q in questions:
        f = q.followup
        if f and getattr(args, f.dest) is not None:
            given[f.id] = getattr(args, f.dest).strip()
    if args.tui:
        return fail("terminal form not built yet; use --web or flags")
    if (folder / "brief.yaml").exists():
        return fail(
            f"{folder / 'brief.yaml'} already exists; quiz brief never overwrites. "
            "Edit it, or choose another folder"
        )
    for q in questions:
        f = q.followup
        if f and given.get(f.id) and f.value not in given.get(q.id, []):
            return fail(f"{f.flag} needs '{f.value}' in {q.flag}")
    if args.web:
        code, answered = _brief_web(args, folder, set(given), should_stop, ready)
        if answered is None:
            return code
        given = {**answered, **given}  # a flag beats the form
    weak = weak_topics(folder)
    res = resolve(
        given, accept_defaults=args.accept_defaults, weak_default=bool(weak.files)
    )
    if res.missing:
        return _brief_needs_input(res.missing, args.dir, args.json)
    for w in weak.warnings:
        print(f"warning: {w}", file=sys.stderr)
    if res.values["weak_topics"] == "yes" and not weak.files:
        print(
            "warning: weak topics asked for, but no results files "
            f"({RESULTS_GLOB}) in {folder}; focus_tags is empty",
            file=sys.stderr,
        )
    made = write_brief_files(folder, to_brief(res, weak.tags))
    not_by_user = res.not_by_user()
    root = folder.resolve()
    nxt = f'Next: tell Claude: "Write the quiz in {root} (brief.yaml is ready)."'
    if args.json:
        data = load_brief(folder)
        print(
            json.dumps(
                {
                    "status": "ok",
                    "dir": str(folder),
                    "files": [str(p) for p in made],
                    "values": data.model_dump() if data else {},
                    "not_given_by_user": not_by_user,
                    "weak_topics": {
                        "from": [str(p) for p in weak.files],
                        "focus_tags": data.focus_tags if data else [],
                    },
                    "next": nxt,
                    "brief": str(root / "brief.yaml"),
                    "content_dir": str(root / "content"),
                },
                indent=2,
                ensure_ascii=False,
            )
        )
        return 0
    for p in made:
        print(f"created {p}")
    if not_by_user:
        print("values the user did not give (change them in brief.yaml):")
        for qid, who in not_by_user.items():
            print(f"  {_flag_of(qid)} = {show_value(res.values[qid])}  [{who}]")
    if weak.files:
        data = load_brief(folder)
        tags = ", ".join(data.focus_tags) if data and data.focus_tags else "none"
        print(
            f"weak topics from {len(weak.files)} results file(s) of {weak.quiz_id}: "
            f"focus_tags = {tags}"
        )
    print(nxt)
    return 0


def _flag_of(qid: str) -> str:
    for q in load_questions():
        if q.id == qid:
            return q.flag
        if q.followup and q.followup.id == qid:
            return q.followup.flag
    return qid


def _brief_needs_input(missing, target: str, as_json: bool) -> int:
    if as_json:
        print(json.dumps(needs_input(missing, target), indent=2, ensure_ascii=False))
        return EXIT_NEEDS_INPUT
    print(
        "needs input: nothing was written. These values need the user:",
        file=sys.stderr,
    )
    for q in missing:
        options = f" ({', '.join(q.values)})" if q.values else ""
        print(f"  {q.flag}  {q.label}{options}", file=sys.stderr)
    print(
        f"Pass them as flags, or open the form: quiz brief {target} --web",
        file=sys.stderr,
    )
    return EXIT_NEEDS_INPUT


def _brief_web(args, folder, skip, should_stop, ready):
    """The --web front end. Returns (exit code, answers); answers is None on failure.

    The form is the brief survey, built in memory (nothing is written beside the
    brief) and served like `quiz serve`; a question given as a flag is left out."""
    if {q.id for q in load_questions()} <= skip:
        return 0, {}
    form, findings = load_quiz_text(
        survey_markdown(skip), "quiz-brief", SURVEY_ID, Path(".")
    )
    if form is None or findings.has_errors:
        for f in findings.sorted():
            print(f.format(), file=sys.stderr)
        print("quiz brief: could not build the form (a bug)", file=sys.stderr)
        return 2, None
    page = build_html(form, Path("."))
    serve_args = argparse.Namespace(
        once=True, timeout=args.timeout, open=not args.no_open, port=args.port
    )
    info = sys.stderr if args.json else sys.stdout
    with tempfile.TemporaryDirectory(prefix="fullmark-brief-") as tmp:
        try:
            server, status = serve_loop(
                page.html,
                SURVEY_ID,
                Path(tmp) / "brief-results.json",
                serve_args,
                info,
                should_stop,
                ready,
            )
        except OSError as exc:
            print(
                f"quiz brief: cannot listen on 127.0.0.1:{args.port}: {exc}",
                file=sys.stderr,
            )
            return 2, None
        if not server.paths:
            print(
                f"quiz brief: no answers arrived within {args.timeout:g} s "
                f"({status}); nothing was written",
                file=sys.stderr,
            )
            return 2, None
        results = json.loads(server.paths[-1].read_text(encoding="utf-8"))
    try:
        return 0, answers_from_results(results)
    except BriefResultsError as exc:
        print(f"quiz brief: {exc}", file=sys.stderr)
        return 2, None


def cmd_brief(args: argparse.Namespace) -> int:
    return brief(args)


def cmd_grade(args: argparse.Namespace) -> int:
    return run_grade(
        Path(args.results),
        Path(args.quiz) if args.quiz else None,
        Path(args.grades) if args.grades else None,
        args.json,
        Path(args.output) if args.output else None,
    )


def cmd_stats(args: argparse.Namespace) -> int:
    quiz = None
    if args.quiz:
        qpath = Path(args.quiz)
        if not qpath.is_file():
            print(f"quiz stats: no such quiz file: {qpath}", file=sys.stderr)
            return 2
        quiz, findings, _ = load_quiz(qpath)
        if findings.has_errors or quiz is None:
            for f in findings.sorted():
                print(f.format(), file=sys.stderr)
            return 1
    try:
        stats, warnings = collect_stats([Path(p) for p in args.results], quiz)
    except ResultsError as exc:
        print(f"quiz stats: {exc}", file=sys.stderr)
        return 2
    sys.stdout.reconfigure(encoding="utf-8")
    if args.json:
        print(json.dumps({**stats, "warnings": warnings}, indent=2, ensure_ascii=False))
    else:
        print(render_stats(stats), end="")
    for w in warnings:
        print(f"warning: {w}", file=sys.stderr)
    return 0


def cmd_inspect(args: argparse.Namespace) -> int:
    path = Path(args.file)
    if not path.is_file():
        print(f"quiz inspect: no such file: {path}", file=sys.stderr)
        return 2
    quiz, findings, text = load_quiz(path)
    if findings.has_errors or quiz is None:
        for f in findings.sorted():
            print(f.format(), file=sys.stderr)
        return 1
    d = inspect_quiz(quiz)
    if args.review:
        try:
            d["review"] = review_counts(quiz, text, load_review(Path(args.review)))
        except ReviewError as exc:
            print(f"quiz inspect: {exc}", file=sys.stderr)
            return 2
    sys.stdout.reconfigure(encoding="utf-8")
    if args.json:
        print(json.dumps(d, indent=2, ensure_ascii=False))
    else:
        print(render_inspect(d), end="")
    return 0


def cmd_new(args: argparse.Namespace) -> int:
    try:
        written = new_from_template(args.template, Path(args.path))
    except KeyError as exc:
        print(f"quiz new: {exc.args[0]}", file=sys.stderr)
        return 2
    except FileExistsError as exc:
        print(f"quiz new: {exc}", file=sys.stderr)
        return 1
    for p in written:
        print(f"created {p}")
    return 0


def cmd_templates(args: argparse.Namespace) -> int:
    print(list_templates())
    return 0


def cmd_guide(args: argparse.Namespace) -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    print(guide_text())
    return 0


def cmd_agent_guide(args: argparse.Namespace) -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    print(agent_guide_text())
    return 0


def cmd_library(args: argparse.Namespace) -> int:
    # The one place the core touches the library, and only on demand.
    from .library import commands

    if args.library_command == "init":
        return commands.init(args)
    if args.library_command == "status":
        return commands.status(args)
    if args.library_command == "register":
        return commands.register(args)
    if args.library_command == "list":
        return commands.list_quizzes(args)
    if args.library_command == "take":
        return commands.take(args)
    if args.library_command == "share":
        return commands.share(args)
    if args.library_command == "path":
        return commands.path_command(args)
    if args.library_command == "grade":
        return commands.grade(args)
    if args.library_command == "stats":
        return commands.stats(args)
    if args.library_command == "rename":
        return commands.rename(args)
    if args.library_command == "rm":
        return commands.rm(args)
    args.library_parser.print_help()
    return 2


COMMAND_GROUPS: dict[str, list[str]] = {
    "Files": [
        "check",
        "build",
        "watch",
        "serve",
        "grade",
        "stats",
        "inspect",
        "review",
        "brief",
        "new",
        "templates",
        "guide",
        "agent-guide",
    ],
    "Library": ["library"],
}


def _grouped_commands(sub: argparse._SubParsersAction) -> str:
    """The command list for `quiz --help`, built from each subparser's own help."""
    helps = {a.dest: a.help or "" for a in sub._choices_actions}
    width = max(len(n) for n in sub.choices) + 2
    lines = ["Markdown to self-grading HTML quiz.", ""]
    for group, names in COMMAND_GROUPS.items():
        lines.append(f"{group}:")
        lines.extend(f"  {n:<{width}}{helps.get(n, '')}".rstrip() for n in names)
        lines.append("")
    lines.append("Run quiz COMMAND --help for the options of one command.")
    return "\n".join(lines)


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="quiz",
        usage="quiz [-h] [--version] COMMAND ...",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument("--version", action="version", version=f"fullmark {__version__}")
    sub = p.add_subparsers(
        dest="command", required=True, metavar="COMMAND", help=argparse.SUPPRESS
    )

    c = sub.add_parser("check", help="validate a quiz file")
    c.add_argument("file")
    c.add_argument("--json", action="store_true", help="print findings as JSON")
    c.add_argument("--strict", action="store_true", help="exit 1 on warnings too")
    c.add_argument(
        "--review", help="also hold the quiz to a review.json written by quiz review"
    )

    b = sub.add_parser("build", help="build the HTML quiz")
    b.add_argument("file")
    b.add_argument("-o", "--output")
    b.add_argument("--open", action="store_true")
    b.add_argument(
        "--strict", action="store_true", help="fail on warnings; write nothing"
    )

    w = sub.add_parser("watch", help="rebuild the HTML whenever the quiz changes")
    w.add_argument("file")
    w.add_argument("-o", "--output")
    w.add_argument(
        "--open", action="store_true", help="open the page after the first build"
    )
    w.add_argument(
        "--serve",
        action="store_true",
        help="serve the page on 127.0.0.1 and reload the browser after each rebuild",
    )
    w.add_argument("--interval", type=float, default=0.5, help=argparse.SUPPRESS)

    s = sub.add_parser(
        "serve", help="serve the page and write the answers it sends back"
    )
    s.add_argument("file", help="the quiz .md or a built .html")
    s.add_argument(
        "--out",
        help="results file (default: <quiz-id>-results-<time>.json beside the source)",
    )
    s.add_argument(
        "--once",
        action="store_true",
        help="exit after the first accepted submit (default when stdout is not a terminal)",
    )
    s.add_argument(
        "--timeout",
        type=float,
        default=1800,
        help="seconds to wait for the first submit; 0 waits forever (default 1800)",
    )
    s.add_argument("--open", action="store_true", help="open the page in the browser")
    s.add_argument(
        "--autosave",
        metavar="PROGRESS.json",
        help="keep the attempt in progress in PATH so it can be resumed after the server or "
        "the browser closes; deleted on submit",
    )
    s.add_argument(
        "--port", type=int, default=0, help="port on 127.0.0.1 (default: a free one)"
    )
    s.add_argument(
        "--json", action="store_true", help="print the outcome as JSON on exit"
    )

    g = sub.add_parser("grade", help="turn results.json into a Markdown report")
    g.add_argument("results")
    g.add_argument("--quiz")
    g.add_argument("-o", "--output")
    g.add_argument(
        "--grades", help="a filled-in grades file (see the -grades.json template)"
    )
    g.add_argument(
        "--json",
        action="store_true",
        help="write a JSON report (results-report.json) instead of Markdown",
    )

    t = sub.add_parser(
        "stats", help="progress across several results files of one quiz"
    )
    t.add_argument("results", nargs="+")
    t.add_argument("--quiz")
    t.add_argument("--json", action="store_true", help="print JSON instead of Markdown")

    i = sub.add_parser(
        "inspect", help="summarize a quiz: types, points, tags, answer positions"
    )
    i.add_argument("file")
    i.add_argument("--json", action="store_true", help="print JSON instead of text")
    i.add_argument(
        "--review", help="add counts against a review.json (kept, to fix, to drop)"
    )

    r = sub.add_parser(
        "review",
        help="the learner checks each question; writes review.json for the author",
    )
    r.add_argument("file", help="the quiz .md")
    r.add_argument(
        "--out",
        help="review file (default: review.json beside the quiz; an existing --out file is merged into)",
    )
    r.add_argument(
        "--since",
        help="an earlier review.json: ask only about new or changed questions, and merge into it",
    )
    r.add_argument("--open", action="store_true", help="open the form in the browser")
    r.add_argument(
        "--once",
        action="store_true",
        help="exit after the first Finish (default when stdout is not a terminal)",
    )
    r.add_argument(
        "--timeout",
        type=float,
        default=1800,
        help="seconds to wait for Finish; 0 waits forever (default 1800)",
    )
    r.add_argument(
        "--port", type=int, default=0, help="port on 127.0.0.1 (default: a free one)"
    )
    r.add_argument(
        "--json", action="store_true", help="print the outcome as JSON on exit"
    )
    r.add_argument(
        "--tui", action="store_true", help="terminal form (not built yet; exits 2)"
    )

    bf = sub.add_parser(
        "brief",
        help="write brief.yaml and content/ for a quiz an agent will write",
        description=(
            "Write DIR/brief.yaml (purpose, scope, material, count, mix, difficulty,"
            " mode, weak topics) and DIR/content/ for an agent to pick up. The quiz"
            " itself is written by the agent from the brief. Exit codes: 0 done,"
            " 2 usage error or timeout, 3 a human-only value (purpose, scope) is"
            " missing and no form was asked for (nothing is written)."
        ),
    )
    bf.add_argument("dir")
    for bq in load_questions():
        bf.add_argument(
            bq.flag,
            dest=bq.dest,
            type=_flag_type(bq),
            default=None,
            metavar="|".join(bq.values) if bq.type == "choice" else bq.type.upper(),
            help=_flag_help(bq),
        )
        if bq.followup:
            bf.add_argument(
                bq.followup.flag,
                dest=bq.followup.dest,
                default=None,
                metavar="TEXT",
                help=f"The text for '{bq.followup.value}' in {bq.flag}: "
                f"{bq.followup.prompt} Needs {bq.followup.value} in {bq.flag}.",
            )
    bf.add_argument(
        "--web", action="store_true", help="ask in a form in the browser (quiz serve)"
    )
    bf.add_argument(
        "--tui", action="store_true", help="terminal form (not built yet; exits 2)"
    )
    bf.add_argument(
        "--no-open",
        action="store_true",
        help="with --web, print the address instead of opening the browser",
    )
    bf.add_argument(
        "--timeout",
        type=float,
        default=1800,
        help="with --web, seconds to wait for the answers (default 1800)",
    )
    bf.add_argument(
        "--port", type=int, default=0, help="with --web, the port (default: a free one)"
    )
    bf.add_argument(
        "--accept-defaults",
        action="store_true",
        help="also fill the human-only values that have a default (recorded as "
        "decided_by: agent). Only when the user handed those choices over.",
    )
    bf.add_argument("--json", action="store_true", help="machine-readable output")

    n = sub.add_parser("new", help="copy an example template")
    n.add_argument("template")
    n.add_argument("path", nargs="?", default=".")

    sub.add_parser("templates", help="list templates")
    sub.add_parser("guide", help="print the authoring guide")
    sub.add_parser(
        "agent-guide", help="print the instructions for AI agents (AGENTS.md)"
    )

    lib = sub.add_parser(
        "library",
        help="keep your quizzes and results in one folder; see quiz library --help",
        description="Keep your quizzes and results in one folder, under git.",
    )
    lib.set_defaults(library_parser=lib)
    lsub = lib.add_subparsers(dest="library_command", metavar="COMMAND")
    li = lsub.add_parser(
        "init", help="make a folder this machine's library (or adopt an existing one)"
    )
    li.add_argument("path", nargs="?", default=".", help="the folder (default: here)")
    li.add_argument(
        "--force",
        action="store_true",
        help="switch this machine to PATH when it already has another library",
    )
    li.add_argument(
        "--no-git", action="store_true", help="do not make a git repository"
    )
    li.add_argument("--json", action="store_true", help="machine-readable output")
    ls = lsub.add_parser(
        "status", help="show the config, the library, git and any problems"
    )
    ls.add_argument("--json", action="store_true", help="machine-readable output")
    ls.add_argument(
        "--plain", action="store_true", help="plain text even in a terminal"
    )
    lr = lsub.add_parser(
        "register",
        help="add a quiz (or a new version of one) to the library",
    )
    lr.add_argument("file", help="the quiz .md file")
    who = lr.add_mutually_exclusive_group()
    who.add_argument("-n", "--name", help="the name to register it under")
    who.add_argument(
        "--update", metavar="NAME", help="add a version to this existing quiz"
    )
    lr.add_argument(
        "--strict", action="store_true", help="refuse when there are warnings"
    )
    lr.add_argument("--review", help="apply this review.json, as quiz check does")
    lr.add_argument("--json", action="store_true", help="machine-readable output")
    ll = lsub.add_parser("list", help="list the quizzes in the library")
    ll.add_argument("--json", action="store_true", help="machine-readable output")
    ll.add_argument(
        "--plain", action="store_true", help="plain text even in a terminal"
    )
    lt = lsub.add_parser(
        "take", help="take a quiz: serve it, then file the result in the library"
    )
    lt.add_argument("name", help="the quiz name or id")
    lt.add_argument("--no-open", action="store_true", help="do not open the browser")
    lt.add_argument(
        "--timeout",
        type=float,
        default=0,
        help="stop waiting after this many seconds (default: 0, no limit)",
    )
    lt.add_argument(
        "--port", type=int, default=0, help="port on 127.0.0.1 (default: a free one)"
    )
    lt.add_argument("--json", action="store_true", help="machine-readable output")
    lh = lsub.add_parser(
        "share", help="write a quiz as a standalone page, or as an editable folder"
    )
    lh.add_argument("name", help="the quiz name or id")
    lh.add_argument(
        "-o", "--output", metavar="DIR", help="where to write (default: here)"
    )
    lh.add_argument(
        "--version",
        metavar="HASH",
        help="an older version (a hash or a prefix of 4 or more characters)",
    )
    lh.add_argument(
        "--source",
        action="store_true",
        help="write the editable source folder instead of the page",
    )
    lp = lsub.add_parser("path", help="print the library folder, or a quiz's folder")
    lp.add_argument("name", nargs="?", help="a quiz name or id")
    lg = lsub.add_parser(
        "grade",
        help="grade an attempt against the version it was taken on (reports go in reports/)",
    )
    lg.add_argument("name", help="the quiz name or id")
    lg.add_argument(
        "--attempt",
        metavar="STAMP",
        help="an attempt (a file name or a prefix of 4 or more characters; default: the newest)",
    )
    lg.add_argument(
        "--grades", metavar="FILE", help="the filled-in grades file for essays and code"
    )
    lg.add_argument("--json", action="store_true", help="write a JSON report")
    lk = lsub.add_parser("stats", help="show progress over all attempts at a quiz")
    lk.add_argument("name", help="the quiz name or id")
    lk.add_argument("--json", action="store_true", help="machine-readable output")
    lrn = lsub.add_parser("rename", help="give a quiz a new name (its id stays)")
    lrn.add_argument("old", help="the quiz name or id")
    lrn.add_argument("new", help="the new name")
    lrn.add_argument("--json", action="store_true", help="machine-readable output")
    lrm = lsub.add_parser(
        "rm", help="delete a quiz with its versions and results (git can bring it back)"
    )
    lrm.add_argument("name", help="the quiz name or id")
    lrm.add_argument("--yes", action="store_true", help="do not ask for confirmation")
    lrm.add_argument(
        "--force",
        action="store_true",
        help="delete even without a git repository or with uncommitted changes",
    )
    lrm.add_argument("--json", action="store_true", help="machine-readable output")

    for name, sp in sub.choices.items():
        sp.set_defaults(func=_stub(name))
    sub.choices["check"].set_defaults(func=cmd_check)
    sub.choices["build"].set_defaults(func=cmd_build)
    sub.choices["watch"].set_defaults(func=cmd_watch)
    sub.choices["serve"].set_defaults(func=cmd_serve)
    sub.choices["review"].set_defaults(func=cmd_review)
    sub.choices["brief"].set_defaults(func=cmd_brief)
    sub.choices["grade"].set_defaults(func=cmd_grade)
    sub.choices["stats"].set_defaults(func=cmd_stats)
    sub.choices["inspect"].set_defaults(func=cmd_inspect)
    sub.choices["new"].set_defaults(func=cmd_new)
    sub.choices["templates"].set_defaults(func=cmd_templates)
    sub.choices["guide"].set_defaults(func=cmd_guide)
    sub.choices["agent-guide"].set_defaults(func=cmd_agent_guide)
    sub.choices["library"].set_defaults(func=cmd_library)
    p.description = _grouped_commands(sub)
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
