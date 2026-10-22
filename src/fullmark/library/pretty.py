"""Colored terminal tables for `quiz library status` and `list`.

Rich is imported lazily inside the functions, so the plain and JSON paths (and the
rest of fullmark) never load it. The renderers take the data the plain and JSON paths
already compute. Color never stands alone: every state also has a symbol or a word.
"""

from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime
from typing import IO, TYPE_CHECKING

if TYPE_CHECKING:
    from rich.console import Console
    from rich.text import Text

# Rich's standard named colors follow the user's terminal theme.
STYLES = {
    "ok": "green",
    "warn": "yellow",
    "bad": "red",
    "info": "dim",
    "heading": "bold",
    "score_high": "green",
    "score_mid": "yellow",
    "score_low": "red",
    "survey": "cyan",
    # The id is what people type (take, share, grade...), so it stands out.
    "id": "bold magenta",
}
SYMBOLS = {"ok": "✓", "warn": "⚠", "bad": "✗", "info": chr(0x2139)}


def use_rich(args: argparse.Namespace) -> bool:
    """True only for a person at a terminal who has not asked for plain text."""
    if getattr(args, "json", False) or getattr(args, "plain", False):
        return False
    if os.environ.get("NO_COLOR"):
        return False
    # Claude Code sets CLAUDECODE=1 in its shells; an agent there gets plain text even
    # when the shell runs in a pseudo-terminal.
    if os.environ.get("CLAUDECODE"):
        return False
    return bool(sys.stdout.isatty())


def make_console(file: IO[str] | None = None, force: bool = False) -> Console:
    from rich.console import Console

    return Console(file=file, force_terminal=True if force else None)


def _mark(kind: str, text: str) -> Text:
    from rich.text import Text

    return Text(f"{SYMBOLS[kind]} {text}", style=STYLES[kind])


def _join(*parts: Text) -> Text:
    from rich.text import Text

    out = Text()
    for i, part in enumerate(parts):
        if i:
            out.append("   ")
        out.append_text(part)
    return out


def _config_value(cfg: dict) -> Text:
    from rich.text import Text

    state = (
        _mark("ok", "exists")
        if cfg["exists"]
        else Text("does not exist", style=STYLES["info"])
    )
    return _join(Text(str(cfg["path"])), state)


def _grid(rows: list[tuple[str, Text]]):
    from rich.padding import Padding
    from rich.table import Table

    grid = Table.grid(padding=(0, 2))
    grid.add_column(style=STYLES["info"], no_wrap=True)
    grid.add_column(overflow="fold")
    for label, value in rows:
        grid.add_row(label, value)
    return Padding(grid, (0, 0, 0, 2))


def print_no_library(report: dict, console: Console | None = None) -> None:
    from rich import box
    from rich.console import Group
    from rich.panel import Panel
    from rich.text import Text

    console = console or make_console()
    body = Group(
        Text("No library on this machine", style=STYLES["heading"]),
        _grid([("config", _config_value(report["config"]))]),
        Text("Make one with: quiz library init PATH", style=STYLES["info"]),
    )
    console.print(
        Panel(
            body,
            title="fullmark library",
            title_align="left",
            border_style=STYLES["warn"],
            box=box.ROUNDED,
            expand=False,
        )
    )


def _plural(n: int, word: str, many: str | None = None) -> str:
    return f"{n} {word if n == 1 else many or word + 's'}"


def print_status(
    report: dict,
    problems: list[str],
    warnings: list[str],
    info: list[str],
    console: Console | None = None,
) -> None:
    from rich import box
    from rich.panel import Panel
    from rich.text import Text

    console = console or make_console()
    lib = report["library"]
    git = report["git"]
    counts = report["counts"]

    if problems:
        worst, word = "bad", _plural(len(problems), "problem")
    elif warnings:
        worst, word = "warn", _plural(len(warnings), "warning")
    else:
        worst, word = "ok", "healthy"
    first = _join(
        _mark("ok" if lib["exists"] else "bad", lib["path"]),
        Text(f"from {lib['source']}", style=STYLES["info"]),
        _mark(worst, word),
    )

    rows: list[tuple[str, Text]] = [
        ("fullmark", Text(str(report["fullmark_version"]))),
        ("config", _config_value(report["config"])),
    ]
    if lib["exists"]:
        parts = [_mark("ok", "exists")]
        parts.append(
            _mark("ok", "writable") if lib["writable"] else _mark("bad", "not writable")
        )
        if lib["format"]:
            parts.append(Text(f"{lib['format']} v{lib['version']}"))
        else:
            parts.append(_mark("bad", "library.toml unreadable"))
    else:
        parts = [_mark("bad", "missing")]
    rows.append(("library", _join(*parts)))

    if git is not None:
        if not git["available"]:
            g = [_mark("warn", "git not installed")]
        elif git["repo"] == "none":
            g = [_mark("warn", "no git repository")]
        elif git["repo"] == "outer":
            g = [_mark("warn", "inside another repository")]
        else:
            g = [
                _mark("ok", "own repository"),
                _mark("warn", "uncommitted changes")
                if git["dirty"]
                else _mark("ok", "no uncommitted changes"),
                _mark("ok", "remote") if git["remote"] else _mark("warn", "no remote"),
            ]
        rows.append(("git", _join(*g)))

    if counts is not None:
        unused = counts["unused_assets"]
        assets = _plural(counts["assets"], "asset")
        if unused:
            assets += f" ({unused} unused)"
        text = (
            f"{_plural(counts['quizzes'], 'quiz', 'quizzes')} · "
            f"{_plural(counts['versions'], 'version')} · "
            f"{_plural(counts['attempts'], 'attempt')} · "
            f"{counts['in_progress']} in progress · {assets}"
        )
        rows.append(("contents", Text(text)))

    console.print(
        Panel(
            first,
            title="fullmark library",
            title_align="left",
            border_style=STYLES[worst],
            box=box.ROUNDED,
        )
    )
    console.print(_grid(rows))
    if problems or warnings or info:
        console.print()
    for kind, items in (("bad", problems), ("warn", warnings), ("info", info)):
        for item in items:
            console.print(_mark(kind, item))


def score_text(row: dict) -> Text:
    from rich.text import Text

    if row["mode"] == "survey":
        return Text("survey", style=STYLES["survey"])
    score = row["last_score"]
    if score is None:
        return Text(chr(0x2013), style=STYLES["info"])
    if score >= 80:
        style = STYLES["score_high"]
    elif score >= 50:
        style = STYLES["score_mid"]
    else:
        style = STYLES["score_low"]
    return Text(f"{round(score)}%", style=style)


def print_list(rows: list[dict], console: Console | None = None) -> None:
    from rich import box
    from rich.table import Table
    from rich.text import Text

    console = console or make_console()
    if not rows:
        console.print(
            Text(
                "No quizzes yet. Register one with: quiz library register FILE.md",
                style=STYLES["info"],
            )
        )
        return
    count = "1 quiz" if len(rows) == 1 else f"{len(rows)} quizzes"
    table = Table(
        box=box.ROUNDED,
        show_lines=True,
        header_style=STYLES["heading"],
        caption=f"{count} · take one with: quiz library take ID",
        caption_style=STYLES["info"],
    )
    # The id comes first, as the thing to type. One "quiz" cell holds the name, the
    # title below it and any note (source changed) last; the title folds, so the
    # table fits an 80-column terminal.
    table.add_column("id", style=STYLES["id"], no_wrap=True)
    table.add_column("quiz", overflow="fold", min_width=24, ratio=1)
    table.add_column("ver", justify="right", no_wrap=True)
    table.add_column("tries", justify="right", no_wrap=True)
    table.add_column("taken", no_wrap=True)
    table.add_column("score", no_wrap=True)
    for r in rows:
        if r["last_taken"]:
            stamp = datetime.fromisoformat(r["last_taken"]).strftime("%Y-%m-%d")
            when = Text(stamp)
        else:
            when = Text("never", style=STYLES["info"])
        cell = Text.assemble(
            (str(r["name"]), STYLES["heading"]),
            "\n",
            (str(r["title"]), STYLES["info"]),
        )
        if r["note"]:
            cell.append(f"\n{SYMBOLS['warn']} {r['note']}", style=STYLES["warn"])
        table.add_row(
            str(r["id"]),
            cell,
            str(r["versions"]),
            str(r["attempts"]),
            when,
            score_text(r),
        )
    console.print(table)
