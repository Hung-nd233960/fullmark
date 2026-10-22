"""`quiz library init` and `quiz library status`. Each returns an exit code."""

from __future__ import annotations

import argparse
import contextlib
import json
import os
import shutil
import sys
import tempfile
import tomllib
from datetime import datetime
from pathlib import Path

from .. import __version__
from ..checking import check_file
from ..grade_run import run_grade
from ..report import ResultsError
from ..serve import serve_loop, unique_path
from ..stats import collect as collect_stats
from ..stats import render as render_stats
from ..validate import load_quiz
from . import config, git, pretty, quizzes, store
from .fsutil import make_writable, sha256_bytes

NO_LIBRARY = "No library on this machine; run `quiz library init [PATH]`"
ENV_WARNING = "FULLMARK_LIBRARY is set and overrides the config in this shell"


def _same(a: str | Path, b: str | Path) -> bool:
    return Path(a).resolve() == Path(b).resolve()


def _listing(path: Path) -> str:
    names = sorted(p.name for p in path.iterdir())
    shown = names[:10]
    return (
        "it already holds: "
        + ", ".join(shown)
        + (f" ...and {len(names) - 10} more" if len(names) > 10 else "")
    )


def init(args: argparse.Namespace) -> int:
    info = sys.stderr if args.json else sys.stdout
    path = Path(args.path).resolve()
    warnings: list[str] = []
    git_info = {"repo": "none", "committed": False}

    def finish(status: str, message: str, code: int) -> int:
        cfg = str(config.config_path())
        if args.json:
            print(
                json.dumps(
                    {
                        "status": status,
                        "path": path.as_posix(),
                        "config": cfg,
                        "git": git_info,
                        "warnings": warnings,
                    },
                    indent=2,
                    ensure_ascii=False,
                )
            )
        print(message, file=info)
        print(f"config: {cfg}", file=info)
        for w in warnings:
            print(f"warning: {w}", file=info)
        return code

    try:
        data = config.load_config()
        configured = config.configured_library()
    except config.ConfigError as exc:
        print(f"quiz library init: {exc}", file=sys.stderr)
        return 2
    if os.environ.get("FULLMARK_LIBRARY"):
        warnings.append(ENV_WARNING)

    here = store.is_library(path)
    if configured and _same(configured, path) and here:
        git_info["repo"] = git.status(path)["repo"]
        return finish(
            "unchanged", f"{path.as_posix()} is already this machine's library", 0
        )
    if configured and not _same(configured, path):
        if store.is_library(Path(configured)):
            if not args.force:
                warnings.append(
                    f"this machine's library is {Path(configured).resolve().as_posix()}, "
                    f"not {path.as_posix()}; pass --force to switch; the old library "
                    "is left as it is"
                )
                return finish(
                    "refused", "the machine already has a library; nothing changed", 2
                )
        else:
            warnings.append(f"the previous library at {configured} no longer exists")

    if path.exists() and not path.is_dir():
        print(f"quiz library init: {path} is not a folder", file=sys.stderr)
        return 2

    if not here and path.is_dir() and any(path.iterdir()):
        reason = (
            f"{path.as_posix()} is not empty and is not a library; use a new or "
            f"empty folder, for example {(path / 'fullmark-library').as_posix()}"
        )
        listing = _listing(path)
        if args.json:
            print(
                json.dumps(
                    {
                        "status": "refused",
                        "reason": reason,
                        "path": path.as_posix(),
                        "config": str(config.config_path()),
                        "git": git_info,
                        "warnings": warnings,
                        "listing": listing,
                    },
                    indent=2,
                    ensure_ascii=False,
                )
            )
        print(f"quiz library init: {reason}", file=sys.stderr)
        print(listing, file=sys.stderr)
        return 2

    try:
        if here:
            status, message = "adopted", f"adopted the library at {path.as_posix()}"
        else:
            status, message = "created", f"created a library at {path.as_posix()}"
            store.create(path)
            if not args.no_git:
                warnings.extend(git.init(path))
                committed, more = git.commit(path, "init: fullmark library")
                git_info["committed"] = committed
                warnings.extend(more)
        data.setdefault("library", {})
        if not isinstance(data["library"], dict):
            data["library"] = {}
        data["library"]["path"] = config.as_config_path(path)
        config.save_config(data)
    except OSError as exc:
        print(f"quiz library init: {exc}", file=sys.stderr)
        return 2
    git_info["repo"] = git.status(path)["repo"]
    return finish(status, message, 0)


def _writable(path: Path) -> bool:
    try:
        with tempfile.NamedTemporaryFile(dir=path, prefix=".fullmark-", suffix=".tmp"):
            pass
    except OSError:
        return False
    return True


def _count_files(root: Path, pattern: str) -> int:
    return sum(1 for p in root.glob(pattern) if p.is_file())


def _check_snapshots(
    library: Path, entries: list[dict], problems: list[str], info: list[str]
) -> dict:
    """Re-hash every snapshot and store asset; report what does not match."""
    store_dir = library / "assets"
    files = (
        sorted(p for p in store_dir.iterdir() if p.is_file())
        if store_dir.is_dir()
        else []
    )
    names = {p.name for p in files}
    for p in files:
        if p.suffix == ".tmp":
            continue
        try:
            ok = sha256_bytes(p.read_bytes()) == p.stem
        except OSError:
            ok = False
        if not ok:
            problems.append(f"assets/{p.name} does not match its hash")
    used: set[str] = set()
    for e in entries:
        qid = str(e.get("id", ""))
        label = e.get("name", qid)
        listed = {
            str(v.get("hash"))
            for v in e.get("versions", [])
            if isinstance(v, dict) and v.get("hash")
        }
        for h in sorted(listed):
            md = quizzes.vpath(library, qid, h, ".md")
            amap_file = quizzes.vpath(library, qid, h, ".assets.toml")
            rel = f"quizzes/{qid}/versions/{h}"
            if not md.is_file():
                problems.append(f"version {h} of {label} is missing {rel}.md")
            else:
                try:
                    good = quizzes.hash_of_bytes(md.read_bytes()) == h
                except (OSError, UnicodeDecodeError):
                    good = False
                if not good:
                    problems.append(f"{rel}.md does not match its hash")
            if not amap_file.is_file():
                problems.append(f"version {h} of {label} is missing {rel}.assets.toml")
                continue
            try:
                amap = tomllib.loads(amap_file.read_text(encoding="utf-8")).get(
                    "assets", {}
                )
            except (OSError, ValueError):
                problems.append(f"{rel}.assets.toml is not readable")
                continue
            for ref, sha in amap.items():
                name = quizzes.asset_name(str(ref), str(sha))
                used.add(name)
                if name not in names:
                    problems.append(
                        f"{rel}.assets.toml refers to {ref}, missing from assets/ ({name})"
                    )
        vdir = quizzes.qdir(library, qid) / "versions"
        if vdir.is_dir():
            for p in sorted(vdir.iterdir()):
                if p.suffix == ".tmp" or not p.is_file():
                    continue
                h = p.name.split(".", 1)[0]
                if h not in listed:
                    problems.append(
                        f"quizzes/{qid}/versions/{p.name} has no entry in library.toml"
                    )
    unused = len(names - used - {n for n in names if n.endswith(".tmp")})
    if unused:
        info.append(f"{unused} unused assets in assets/")
    return {"count": len(names), "unused": unused}


def status(args: argparse.Namespace) -> int:
    problems: list[str] = []
    warnings: list[str] = []
    info: list[str] = []
    lines: list[str] = []
    cfg = config.config_path()
    cfg_exists = cfg.is_file()
    report = {
        "status": "ok",
        "fullmark_version": __version__,
        "config": {"path": str(cfg), "exists": cfg_exists},
        "library": None,
        "git": None,
        "counts": None,
        "problems": problems,
        "warnings": warnings,
        "info": info,
    }
    lines.append(f"fullmark: {__version__}")
    lines.append(f"config: {cfg} ({'exists' if cfg_exists else 'does not exist'})")

    try:
        path, source = config.library_location()
    except config.ConfigError as exc:
        print(f"quiz library status: {exc}", file=sys.stderr)
        return 2
    if path is None:
        report["status"] = "no_library"
        if args.json:
            print(json.dumps(report, indent=2, ensure_ascii=False))
        elif pretty.use_rich(args):
            pretty.print_no_library(report)
            print(NO_LIBRARY, file=sys.stderr)
        else:
            print("\n".join(lines))
            print(NO_LIBRARY, file=sys.stderr)
        return 2

    if source == "FULLMARK_LIBRARY":
        warnings.append(ENV_WARNING)
    exists = path.is_dir()
    lib = {
        "path": path.as_posix(),
        "source": source,
        "exists": exists,
        "writable": None,
        "format": None,
        "version": None,
    }
    report["library"] = lib
    lines.append(f"library: {path.as_posix()} (from {source})")
    lines.append(f"library exists: {'yes' if exists else 'no'}")

    if not exists:
        problems.append(f"the library folder is missing: {path.as_posix()}")
    else:
        lib["writable"] = _writable(path)
        lines.append(f"library writable: {'yes' if lib['writable'] else 'no'}")
        if not lib["writable"]:
            problems.append(f"the library folder is not writable: {path.as_posix()}")
        entries: list[dict] | None = None
        try:
            data = store.load(path)
        except store.LibraryError as exc:
            problems.append(str(exc))
            lines.append("library.toml: unreadable")
        else:
            lib["format"] = data.get("format")
            lib["version"] = data.get("version")
            lines.append(f"library.toml: {lib['format']} version {lib['version']}")
            raw = data.get("quiz", [])
            entries = (
                [e for e in raw if isinstance(e, dict)] if isinstance(raw, list) else []
            )

        g = git.status(path)
        report["git"] = g
        if not g["available"]:
            warnings.append("git is not installed; the library has no history")
            lines.append("git: not installed")
        elif g["repo"] == "none":
            hint = f'git -C "{path}" init'
            warnings.append(
                "not a git repository: the library has no history; "
                f"to add it, run: {hint}"
            )
            lines.append("git: none")
        elif g["repo"] == "outer":
            warnings.append(
                f"inside the git repository {g['toplevel']}; fullmark will not commit"
            )
            lines.append(f"git: inside another repository ({g['toplevel']})")
        else:
            lines.append("git: own repository")
            lines.append(f"git uncommitted changes: {'yes' if g['dirty'] else 'no'}")
            lines.append(f"git remote: {'yes' if g['remote'] else 'none'}")
            if g["dirty"]:
                warnings.append("uncommitted changes in the library")
            if not g["remote"]:
                warnings.append(
                    "no remote: the git history is not an off-machine backup"
                )

        qdir = path / "quizzes"
        folders = (
            sorted(p.name for p in qdir.iterdir() if p.is_dir())
            if qdir.is_dir()
            else []
        )
        counts = {
            "quizzes": len(entries) if entries is not None else 0,
            "versions": 0,
            "attempts": _count_files(qdir, "*/results/*.json") if qdir.is_dir() else 0,
            "in_progress": _count_files(qdir, "*/progress.json")
            if qdir.is_dir()
            else 0,
        }
        if entries is not None:
            ids = set()
            for e in entries:
                v = e.get("versions", [])
                counts["versions"] += len(v) if isinstance(v, list) else 0
                ids.add(str(e.get("id", "")))
            for name in folders:
                if name not in ids:
                    problems.append(f"quizzes/{name} has no entry in library.toml")
            for e in entries:
                qid = str(e.get("id", ""))
                if qid not in folders:
                    label = e.get("name", qid)
                    problems.append(
                        f"the entry {label} ({qid}) has no folder in quizzes/"
                    )
        asset_total = _check_snapshots(path, entries or [], problems, info)
        qdir_ = path / "quizzes"
        if qdir_.is_dir():
            for e in entries or []:
                for r in quizzes.read_results(path, str(e.get("id", ""))):
                    if r["data"] is None:
                        rel = r["path"].relative_to(path).as_posix()
                        problems.append(f"{rel} is not a readable results file")
        counts["assets"] = asset_total["count"]
        counts["unused_assets"] = asset_total["unused"]
        report["counts"] = counts
        lines.append(
            f"quizzes: {counts['quizzes']}, versions: {counts['versions']}, "
            f"attempts: {counts['attempts']}, in progress: {counts['in_progress']}"
        )
        lines.append(f"assets: {asset_total['count']}")

    report["status"] = "problems" if problems else "ok"
    if args.json:
        print(json.dumps(report, indent=2, ensure_ascii=False))
    elif pretty.use_rich(args):
        pretty.print_status(report, problems, warnings, info)
    else:
        print("\n".join(lines))
        for p in problems:
            print(f"problem: {p}")
        for w in warnings:
            print(f"warning: {w}")
        for i in info:
            print(f"info: {i}")
    return 1 if problems else 0


# ------------------------------------------------------------------ register


def _needs_library(as_json: bool) -> int:
    fix = "quiz library init PATH"
    message = (
        f"no library on this machine; ask the user where it should go, then run {fix}"
    )
    if as_json:
        missing = {
            "id": "library",
            "flag": None,
            "label": "Library folder",
            "help": (
                "Where fullmark keeps your quizzes and results (for example "
                "D:/quizzes). Created by quiz library init PATH."
            ),
            "choices": None,
        }
        out = {
            "status": "needs_input",
            "written": False,
            "message": message,
            "missing": [missing],
            "fix": fix,
        }
        print(json.dumps(out, indent=2, ensure_ascii=False))
    else:
        print(message, file=sys.stderr)
    return 3


def _open_library(command: str) -> tuple[Path, dict] | int:
    """The configured library and its registry, or an exit code after printing why.

    -1 means no library is configured."""
    try:
        path, _source = config.library_location()
    except config.ConfigError as exc:
        print(f"quiz library {command}: {exc}", file=sys.stderr)
        return 2
    if path is None:
        return -1
    try:
        return path, store.load(path)
    except store.LibraryError as exc:
        print(f"quiz library {command}: {exc}", file=sys.stderr)
        return 2


def _same_file(a: str, b: str) -> bool:
    return os.path.normcase(str(Path(a).resolve())) == os.path.normcase(
        str(Path(b).resolve())
    )


def register(args: argparse.Namespace) -> int:
    opened = _open_library("register")
    if opened == -1:
        return _needs_library(args.json)
    if isinstance(opened, int):
        return opened
    library, data = opened
    src = Path(args.file)
    shown = sys.stderr if args.json else sys.stdout

    if args.name is not None and not quizzes.NAME_RE.match(args.name):
        print(f"quiz library register: {quizzes.NAME_RULE}", file=sys.stderr)
        return 2

    res = check_file(src, args.review)
    if res.error:
        print(f"quiz library register: {res.error}", file=sys.stderr)
        return 2
    items = res.findings.sorted()
    for f in items:
        print(f.format(), file=shown)
    if res.findings.has_errors or res.quiz is None:
        print("quiz library register: fix the errors above first", file=sys.stderr)
        return 1
    if args.strict and any(f.severity == "warning" for f in items):
        print(
            "quiz library register: --strict treats warnings as errors",
            file=sys.stderr,
        )
        return 1
    quiz = res.quiz

    try:
        assets = quizzes.collect_assets(res.text, src.parent)
    except quizzes.RefError as exc:
        print(
            f"{src.name}:{exc.line}: error: {exc.ref} is outside the quiz folder; "
            "move it under the quiz folder (for example assets/) to register "
            "this quiz",
            file=sys.stderr,
        )
        return 1
    except OSError as exc:
        print(f"quiz library register: cannot read an asset: {exc}", file=sys.stderr)
        return 2
    try:
        md = src.read_bytes()
        brief_file = src.parent / "brief.yaml"
        brief = brief_file.read_bytes() if brief_file.is_file() else None
    except OSError as exc:
        print(f"quiz library register: cannot read {src}: {exc}", file=sys.stderr)
        return 2

    entries = quizzes.entries_of(data)
    taken = {str(e.get("name")) for e in entries}
    name_defaulted = args.name is None and not args.update
    entry: dict | None = None
    if args.update:
        try:
            entry = quizzes.lookup(data, args.update)
        except quizzes.QuizError as exc:
            print(f"quiz library register: {exc}", file=sys.stderr)
            return 2
        name = str(entry["name"])
    else:
        for e in entries:
            if isinstance(e.get("source"), str) and _same_file(e["source"], str(src)):
                print(
                    f"quiz library register: {src} is registered as {e['name']} "
                    f"({e['id']}); pass --update {e['name']} to add a version, "
                    "or -n NEW for a separate quiz",
                    file=sys.stderr,
                )
                return 1
        name = args.name or quizzes.slugify(quiz.meta.title)
        if name in taken:
            suggested = quizzes.free_name(name, taken)
            owner = next(e for e in entries if e.get("name") == name)
            if args.json:
                out = {
                    "status": "name_taken",
                    "name": name,
                    "suggested_name": suggested,
                }
                print(json.dumps(out, indent=2, ensure_ascii=False))
            print(
                f"quiz library register: the name {name} is taken by "
                f"{owner.get('title')}; pass -n {suggested} or --update {name}",
                file=sys.stderr,
            )
            return 1

    hash_ = quiz.source_hash
    try:
        with tempfile.TemporaryDirectory(prefix="fullmark-stage-") as tmp:
            staged = quizzes.write_stage(Path(tmp), src.name, md, assets, brief)
            quizzes.build_staged(staged, hash_)
    except quizzes.QuizError as exc:
        print(f"quiz library register: {exc}", file=sys.stderr)
        return 1
    except OSError as exc:
        print(f"quiz library register: {exc}", file=sys.stderr)
        return 2

    now = datetime.now().replace(microsecond=0)
    new_ver = {"hash": hash_, "file": src.name, "added": now}
    source_posix = src.resolve().as_posix()
    warnings: list[str] = []
    try:
        if entry is None:
            status = "registered"
            qid = quizzes.new_id({str(e.get("id")) for e in entries})
            entry = {
                "id": qid,
                "name": name,
                "title": quiz.meta.title,
                "source": source_posix,
                "current": hash_,
                "registered": now,
                "versions": [new_ver],
            }
            quizzes.write_version(library, qid, hash_, md, assets, brief)
            data.setdefault("quiz", []).append(entry)
        else:
            qid = str(entry["id"])
            versions = entry.setdefault("versions", [])
            current = str(entry.get("current", ""))
            same_files = False
            if hash_ == current:
                try:
                    _m, old_map, old_brief = quizzes.read_version(library, qid, hash_)
                    same_files = (
                        old_map == quizzes.asset_map(assets) and old_brief == brief
                    )
                except (OSError, ValueError):
                    same_files = False
            if same_files:
                status = "unchanged"
            else:
                attempts = quizzes.attempts_for(library, qid, current)
                if attempts == 0:
                    status = "replaced"
                elif hash_ == current:
                    status = "updated-assets"
                else:
                    status = "new-version"
                quizzes.write_version(library, qid, hash_, md, assets, brief)
                if status == "replaced":
                    idx = next(
                        i for i, v in enumerate(versions) if v.get("hash") == current
                    )
                    if hash_ != current:
                        quizzes.remove_version(library, qid, current)
                    versions[idx] = new_ver
                    # A hash that was already another version keeps one entry only.
                    versions[:] = [
                        v
                        for i, v in enumerate(versions)
                        if i == idx or v.get("hash") != hash_
                    ]
                elif status == "new-version":
                    others = [v for v in versions if v.get("hash") == hash_]
                    if others:
                        others[0].update(new_ver)
                    else:
                        versions.append(new_ver)
                entry["current"] = hash_
                entry["title"] = quiz.meta.title
                entry["source"] = source_posix
        if status != "unchanged":
            store.save(library, data)
    except OSError as exc:
        print(f"quiz library register: {exc}", file=sys.stderr)
        return 2

    committed = False
    if status != "unchanged":
        committed, more = git.commit(
            library, f"register: {name} ({status}, {hash_[:7]})"
        )
        warnings.extend(more)
    take = f"quiz library take {name}"
    if args.json:
        out = {
            "status": status,
            "id": qid,
            "name": name,
            "name_defaulted": name_defaulted,
            "hash": hash_,
            "version_count": len(entry["versions"]),
            "committed": committed,
            "warnings": warnings,
            "take": take,
        }
        print(json.dumps(out, indent=2, ensure_ascii=False))
    else:
        print(f"{status} {name} ({qid}), version {hash_[:7]}; take it with: {take}")
        for w in warnings:
            print(f"warning: {w}")
    return 0


# ------------------------------------------------------------------ list


def _rows(library: Path, data: dict) -> list[dict]:
    rows = []
    for e in quizzes.entries_of(data):
        info = quizzes.summarize(library, e)
        versions = e.get("versions", [])
        rows.append(
            {
                "name": e.get("name"),
                "id": e.get("id"),
                "title": e.get("title"),
                "versions": len(versions) if isinstance(versions, list) else 0,
                "attempts": info["attempts"],
                "last_taken": info["last_taken"],
                "last_score": info["last_score"],
                "mode": info["mode"],
                "note": quizzes.source_note(library, e),
            }
        )
    taken = sorted(
        (r for r in rows if r["last_taken"]),
        key=lambda r: datetime.fromisoformat(str(r["last_taken"])),
        reverse=True,
    )
    never = sorted(
        (r for r in rows if not r["last_taken"]), key=lambda r: str(r["name"])
    )
    return taken + never


def _score_text(row: dict) -> str:
    if row["mode"] == "survey":
        return "survey"
    if row["last_score"] is None:
        return "-"
    return f"{round(row['last_score'])}%"


def list_quizzes(args: argparse.Namespace) -> int:
    opened = _open_library("list")
    if opened == -1:
        print(NO_LIBRARY, file=sys.stderr)
        return 2
    if isinstance(opened, int):
        return opened
    library, data = opened
    rows = _rows(library, data)
    if args.json:
        print(json.dumps(rows, indent=2, ensure_ascii=False))
        return 0
    if pretty.use_rich(args):
        pretty.print_list(rows)
        return 0
    if not rows:
        print("No quizzes yet. Register one with: quiz library register FILE.md")
        return 0
    head = [
        "id",
        "name",
        "title",
        "versions",
        "attempts",
        "last taken",
        "last score",
        "note",
    ]
    body = []
    for r in rows:
        when = (
            datetime.fromisoformat(r["last_taken"]).strftime("%Y-%m-%d %H:%M")
            if r["last_taken"]
            else "never"
        )
        body.append(
            [
                str(r["id"]),
                str(r["name"]),
                str(r["title"]),
                str(r["versions"]),
                str(r["attempts"]),
                when,
                _score_text(r),
                r["note"] or "",
            ]
        )
    widths = [max(len(x[i]) for x in [head, *body]) for i in range(len(head))]
    for line in [head, *body]:
        print("  ".join(c.ljust(w) for c, w in zip(line, widths, strict=True)).rstrip())
    return 0


# ------------------------------------------------------------------ take, share, path


def _resolve(command: str, name: str) -> tuple[Path, dict, dict] | int:
    """The library, its registry and the named entry, or an exit code after printing why."""
    opened = _open_library(command)
    if opened == -1:
        print(NO_LIBRARY, file=sys.stderr)
        return 2
    if isinstance(opened, int):
        return opened
    library, data = opened
    try:
        entry = quizzes.lookup(data, name)
    except quizzes.QuizError as exc:
        print(f"quiz library {command}: {exc}", file=sys.stderr)
        return 2
    return library, data, entry


def _number(value: float) -> str:
    return f"{value:g}"


def _score_lines(results: dict | None) -> tuple[str, str]:
    """The printed score line and the short form used in the commit message."""
    attempt = (results or {}).get("attempt") or {}
    score = (results or {}).get("score") or {}
    if attempt.get("mode") == "survey":
        return "answers saved (survey)", "survey"
    earned = score.get("earned", 0)
    possible = score.get("possible_auto", 0)
    percent = score.get("percent_auto")
    line = f"score: {_number(earned)}/{_number(possible)}"
    short = "no auto score"
    if isinstance(percent, (int, float)):
        short = f"{round(percent)}%"
        line += f" ({short})"
    pending = score.get("pending_points") or 0
    if pending > 0:
        line += f", {_number(pending)} points wait for AI grading"
    return line, short


def take(args: argparse.Namespace, should_stop=lambda: False, ready=None) -> int:
    """`quiz library take`: build the current version, serve it, file the result.

    `ready(url)` is called once the server is up (tests use it)."""
    resolved = _resolve("take", args.name)
    if isinstance(resolved, int):
        return resolved
    library, _data, entry = resolved
    name, qid, current = str(entry["name"]), str(entry["id"]), str(entry["current"])
    info = sys.stderr if args.json else sys.stdout
    warnings: list[str] = []

    note = quizzes.source_note(library, entry)
    if note is not None:
        if "has errors" in note:
            text = (
                f"{name}: the source changed since it was registered and has "
                "errors; taking the registered version."
            )
        else:
            text = (
                f"{name}: the source changed since it was registered; taking the "
                f"registered version. Run quiz library register {entry.get('source')} "
                f"--update {name} to update it."
            )
        warnings.append(text)
        print(f"warning: {text}", file=sys.stderr)

    try:
        with quizzes.stage(library, entry, current) as staged:
            quiz, html = quizzes.build_staged(staged, expected_hash=current)
    except (quizzes.QuizError, OSError) as exc:
        print(f"quiz library take: {exc}; see quiz library status", file=sys.stderr)
        return 1

    started = datetime.now().strftime("%Y%m%d-%H%M%S")
    folder = quizzes.qdir(library, qid)
    progress = folder / "progress.json"
    out = folder / "results" / f"{started}.json"
    serve_args = argparse.Namespace(
        once=True,
        open=not args.no_open,
        timeout=args.timeout,
        port=args.port,
        autosave=str(progress),
        focus=getattr(args, "focus", False),
    )
    try:
        out.parent.mkdir(parents=True, exist_ok=True)
        server, status = serve_loop(
            html,
            quiz.id,
            out,
            serve_args,
            info,
            should_stop,
            ready,
            quiz_hash=current,
        )
    except OSError as exc:
        print(
            f"quiz serve: cannot listen on 127.0.0.1:{args.port}: {exc}",
            file=sys.stderr,
        )
        return 2

    committed = False
    results_path: Path | None = None
    score: dict | None = None
    mode = None
    if server.paths:
        results_path = server.paths[-1]
        data = None
        try:
            data = json.loads(results_path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            warnings.append(f"could not read {results_path.name} to show the score")
        if not isinstance(data, dict):
            data = None
        line, short = _score_lines(data)
        mode = ((data or {}).get("attempt") or {}).get("mode", "quiz")
        raw = (data or {}).get("score")
        if isinstance(raw, dict) and mode != "survey":
            score = {
                "earned": raw.get("earned"),
                "possible_auto": raw.get("possible_auto"),
                "percent_auto": raw.get("percent_auto"),
                "pending_points": raw.get("pending_points", 0),
            }
        rel = results_path.resolve().relative_to(Path(library).resolve()).as_posix()
        print(f"saved {rel}", file=info)
        print(line, file=info)
        committed, more = git.commit(library, f"take: {name} ({short}, {current[:7]})")
        warnings.extend(more)
        for w in more:
            print(f"warning: {w}", file=sys.stderr)
        status = "submitted"
    else:
        status = "timeout"
        if args.timeout and not should_stop():
            print(
                f"quiz library take: no answers arrived within {args.timeout:g} s",
                file=sys.stderr,
            )
    resume = progress.is_file()
    if not server.paths and resume:
        print(f"progress saved; run quiz library take {name} to resume", file=info)

    if args.json:
        outcome = {
            "status": status,
            "name": name,
            "id": qid,
            "hash": current,
            "results": str(results_path.resolve()) if results_path else None,
            "score": score,
            "mode": mode,
            "committed": committed,
            "warnings": warnings,
            "resume": resume,
        }
        print(json.dumps(outcome, indent=2, ensure_ascii=False))
    return 0 if server.paths else 2


def _pick_version(entry: dict, text: str | None) -> str | None:
    """The hash `--version` names (a full hash or a unique prefix of 4+ characters), or
    None after printing the versions."""
    versions = [
        v for v in entry.get("versions", []) if isinstance(v, dict) and v.get("hash")
    ]
    if text is None:
        return str(entry["current"])
    hashes = [str(v["hash"]) for v in versions]
    found = [h for h in hashes if h == text]
    if not found and len(text) >= 4:
        found = [h for h in hashes if h.startswith(text)]
    if len(found) == 1:
        return found[0]
    why = "matches more than one version" if found else "is not a version"
    print(f"quiz library share: {text!r} {why} of {entry['name']}:", file=sys.stderr)
    for v in versions:
        print(f"  {v['hash']} ({v.get('added')})", file=sys.stderr)
    return None


def share(args: argparse.Namespace) -> int:
    resolved = _resolve("share", args.name)
    if isinstance(resolved, int):
        return resolved
    library, _data, entry = resolved
    name, qid = str(entry["name"]), str(entry["id"])
    hash_ = _pick_version(entry, args.version)
    if hash_ is None:
        return 2
    dest = Path(args.output) if args.output else Path.cwd()
    try:
        if args.source:
            ver = quizzes.version_of(entry, hash_)
            md, amap, brief = quizzes.read_version(library, qid, hash_)
            assets = quizzes.read_assets(library, amap)
            dest.mkdir(parents=True, exist_ok=True)
            folder = unique_path(dest / name)
            folder.mkdir()
            file = quizzes.write_stage(
                folder, str(ver.get("file", "quiz.md")), md, assets, brief
            )
            print(folder.resolve())
            print(
                f"edit it, then: quiz library register {file.resolve()} --update {name}"
            )
            return 0
        with quizzes.stage(library, entry, hash_) as staged:
            _quiz, html = quizzes.build_staged(staged, expected_hash=hash_)
        dest.mkdir(parents=True, exist_ok=True)
        out = unique_path(dest / f"{name}.html")
        out.write_text(html, encoding="utf-8", newline="\n")
    except quizzes.QuizError as exc:
        print(f"quiz library share: {exc}; see quiz library status", file=sys.stderr)
        return 1
    except OSError as exc:
        print(f"quiz library share: {exc}", file=sys.stderr)
        return 2
    print(out.resolve())
    return 0


def path_command(args: argparse.Namespace) -> int:
    if args.name is None:
        opened = _open_library("path")
        if opened == -1:
            print(NO_LIBRARY, file=sys.stderr)
            return 2
        if isinstance(opened, int):
            return opened
        print(Path(opened[0]).resolve())
        return 0
    resolved = _resolve("path", args.name)
    if isinstance(resolved, int):
        return resolved
    library, _data, entry = resolved
    print(quizzes.qdir(library, str(entry["id"])).resolve())
    return 0


# ------------------------------------------------------------------ grade, stats


def _readable_attempts(library: Path, qid: str) -> list[dict]:
    """The readable results files of a quiz, oldest first."""
    found = [r for r in quizzes.read_results(library, qid) if r["data"] is not None]
    return sorted(found, key=quizzes._when)


def _no_attempts(command: str, name: str) -> int:
    print(
        f"quiz library {command}: {name} has no attempts yet; "
        f"take it with quiz library take {name}",
        file=sys.stderr,
    )
    return 2


def _pick_attempt(entry: dict, attempts: list[dict], text: str | None) -> dict | None:
    """The attempt `--attempt` names (a file stem or a unique prefix of 4+ characters),
    the newest by default, or None after printing the attempts."""
    if text is None:
        return attempts[-1]
    stems = [a["path"].stem for a in attempts]
    found = [i for i, st in enumerate(stems) if st == text]
    if not found and len(text) >= 4:
        found = [i for i, st in enumerate(stems) if st.startswith(text)]
    if len(found) == 1:
        return attempts[found[0]]
    why = "matches more than one attempt" if found else "is not an attempt"
    print(f"quiz library grade: {text!r} {why} of {entry['name']}:", file=sys.stderr)
    for st in stems:
        print(f"  {st}", file=sys.stderr)
    return None


def _hash_of(result: dict) -> str | None:
    quiz = (result["data"] or {}).get("quiz")
    value = quiz.get("hash") if isinstance(quiz, dict) else None
    return str(value) if value else None


def _has_version(entry: dict, hash_: str | None) -> bool:
    return hash_ is not None and any(
        isinstance(v, dict) and v.get("hash") == hash_
        for v in entry.get("versions", [])
    )


def grade(args: argparse.Namespace) -> int:
    """`quiz library grade`: grade one attempt against the version it was taken on."""
    resolved = _resolve("grade", args.name)
    if isinstance(resolved, int):
        return resolved
    library, _data, entry = resolved
    name, qid = str(entry["name"]), str(entry["id"])
    attempts = _readable_attempts(library, qid)
    if not attempts:
        return _no_attempts("grade", name)
    attempt = _pick_attempt(entry, attempts, args.attempt)
    if attempt is None:
        return 2
    stem = attempt["path"].stem
    hash_ = _hash_of(attempt)
    reports = quizzes.qdir(library, qid) / "reports"
    output = reports / f"{stem}-report.{'json' if args.json else 'md'}"
    extra: list[str] = []
    try:
        reports.mkdir(exist_ok=True)
        with contextlib.ExitStack() as stack:
            staged = None
            if _has_version(entry, hash_):
                try:
                    staged = stack.enter_context(
                        quizzes.stage(library, entry, str(hash_))
                    )
                except (quizzes.QuizError, OSError):
                    staged = None
            if staged is None:
                extra.append(
                    f"version {hash_ or '(unknown)'} is not in the library; "
                    "using the browser's grades"
                )
            code = run_grade(
                attempt["path"],
                staged,
                Path(args.grades) if args.grades else None,
                args.json,
                output,
                template_dir=reports,
                prog="quiz library grade",
                beside=False,
                extra_warnings=extra,
            )
    except OSError as exc:
        print(f"quiz library grade: {exc}", file=sys.stderr)
        return 2
    if code == 0:
        _committed, more = git.commit(library, f"grade: {name} {stem}")
        for w in more:
            print(f"warning: {w}", file=sys.stderr)
    return code


def stats(args: argparse.Namespace) -> int:
    """`quiz library stats`: progress over every attempt at one quiz."""
    resolved = _resolve("stats", args.name)
    if isinstance(resolved, int):
        return resolved
    library, _data, entry = resolved
    name, qid = str(entry["name"]), str(entry["id"])
    attempts = _readable_attempts(library, qid)
    if not attempts:
        return _no_attempts("stats", name)
    hashes = {_hash_of(a) for a in attempts}
    warnings: list[str] = []
    quiz = None
    only = next(iter(hashes))
    if len(hashes) > 1:
        warnings.append(
            f"attempts span {len(hashes)} versions; using the grades each attempt "
            "was made with"
        )
    elif _has_version(entry, only):
        try:
            with quizzes.stage(library, entry, str(only)) as staged:
                quiz, findings, _text = load_quiz(staged)
            if findings.has_errors:
                quiz = None
        except (quizzes.QuizError, OSError):
            quiz = None
    if quiz is None and len(hashes) == 1:
        warnings.append(
            f"version {only or '(unknown)'} is not usable; using the grades each "
            "attempt was made with"
        )
    try:
        result, more = collect_stats([a["path"] for a in attempts], quiz)
    except ResultsError as exc:
        print(f"quiz library stats: {exc}", file=sys.stderr)
        return 2
    warnings.extend(more)
    sys.stdout.reconfigure(encoding="utf-8")  # ty: ignore[unresolved-attribute]
    if args.json:
        print(
            json.dumps({**result, "warnings": warnings}, indent=2, ensure_ascii=False)
        )
    else:
        print(render_stats(result), end="")
    for w in warnings:
        print(f"warning: {w}", file=sys.stderr)
    return 0


# ------------------------------------------------------------------ rename, rm


def rename(args: argparse.Namespace) -> int:
    """`quiz library rename OLD NEW`: change a quiz's name. Folders are keyed by id."""
    resolved = _resolve("rename", args.old)
    if isinstance(resolved, int):
        return resolved
    library, data, entry = resolved
    old, new, qid = str(entry["name"]), args.new, str(entry["id"])
    if not quizzes.NAME_RE.match(new):
        print(f"quiz library rename: {quizzes.NAME_RULE}", file=sys.stderr)
        return 2
    info = sys.stderr if args.json else sys.stdout

    def finish(status: str, message: str, committed: bool, warnings: list[str]) -> int:
        if args.json:
            out = {
                "status": status,
                "id": qid,
                "old": old,
                "new": new,
                "committed": committed,
                "warnings": warnings,
            }
            print(json.dumps(out, indent=2, ensure_ascii=False))
        print(message, file=info)
        for w in warnings:
            print(f"warning: {w}", file=sys.stderr)
        return 0

    if new == old:
        return finish("unchanged", "nothing to do", False, [])
    for other in quizzes.entries_of(data):
        if other is entry:
            continue
        if new in (other.get("name"), other.get("id")):
            print(
                f"quiz library rename: {new} is already the name or id of "
                f"{other.get('name')} ({other.get('id')})",
                file=sys.stderr,
            )
            return 2
    entry["name"] = new
    try:
        store.save(library, data)
    except OSError as exc:
        print(f"quiz library rename: {exc}", file=sys.stderr)
        return 2
    committed, warnings = git.commit(library, f"rename: {old} -> {new}")
    return finish("renamed", f"renamed {old} to {new}", committed, warnings)


def _rmtree(path: Path) -> None:
    """Delete a folder, clearing the read-only flag of version files on the way."""

    def onexc(func, target, exc):
        if not isinstance(exc, PermissionError):
            raise exc
        make_writable(Path(target))
        func(target)

    shutil.rmtree(path, onexc=onexc)


def rm(args: argparse.Namespace) -> int:
    """`quiz library rm NAME`: delete a quiz, its versions and its results."""
    resolved = _resolve("rm", args.name)
    if isinstance(resolved, int):
        return resolved
    library, data, entry = resolved
    name, qid = str(entry["name"]), str(entry["id"])
    versions = entry.get("versions", [])
    n_versions = len(versions) if isinstance(versions, list) else 0
    n_attempts = len(quizzes.read_results(library, qid))
    info = sys.stderr if args.json else sys.stdout
    warnings: list[str] = []

    def finish(status: str, code: int, reason: str | None, committed: bool = False):
        if args.json:
            out = {
                "status": status,
                "id": qid,
                "name": name,
                "versions": n_versions,
                "attempts": n_attempts,
                "committed": committed,
                "warnings": warnings,
                "reason": reason,
            }
            print(json.dumps(out, indent=2, ensure_ascii=False))
        return code

    def refuse(reason: str) -> int:
        print(f"quiz library rm: {reason}", file=sys.stderr)
        return finish("refused", 2, reason)

    folder = quizzes.qdir(library, qid)
    if not args.force:
        if not git.owns_repo(library):
            return refuse(
                "the delete cannot be undone because the library is not its own "
                "git repository; pass --force to delete anyway"
            )
        if git.dirty_path(library, f"quizzes/{qid}"):
            return refuse(
                f"quizzes/{qid} has uncommitted changes; commit them first "
                f"(git -C {library.as_posix()} add -A, then commit) or pass --force"
            )
    if not args.yes:
        if args.json or not sys.stdin.isatty():
            return refuse("pass --yes to confirm")
        try:
            answer = input(
                f"Delete {name} ({qid}): {n_versions} versions, "
                f"{n_attempts} attempts? [y/N] "
            )
        except EOFError:
            print(file=sys.stderr)
            return refuse("pass --yes to confirm")
        if answer.strip().lower() not in ("y", "yes"):
            print("nothing deleted", file=sys.stderr)
            return finish("cancelled", 1, "not confirmed")

    kept = [e for e in quizzes.entries_of(data) if e is not entry]
    if kept:
        data["quiz"] = kept
    else:
        data.pop("quiz", None)
    try:
        store.save(library, data)
    except OSError as exc:
        print(f"quiz library rm: {exc}; nothing deleted", file=sys.stderr)
        return finish("refused", 1, str(exc))
    try:
        if folder.exists():
            _rmtree(folder)
    except OSError as exc:
        reason = (
            f"{name} is removed from library.toml but quizzes/{qid} could not be "
            f"deleted ({exc}); delete quizzes/{qid} by hand"
        )
        print(f"quiz library rm: {reason}", file=sys.stderr)
        return finish("refused", 1, reason)
    committed, warnings = git.commit(library, f"rm: {name} ({qid})")
    if committed:
        message = (
            f"deleted {name}; recover it with git -C {library.as_posix()} revert HEAD"
        )
    else:
        message = f"deleted {name}"
    print(message, file=info)
    for w in warnings:
        print(f"warning: {w}", file=sys.stderr)
    return finish("deleted", 0, None, committed)
