"""The library folder: creating it and reading `library.toml`."""

from __future__ import annotations

import tomllib
from datetime import datetime
from pathlib import Path

import tomli_w

from .fsutil import atomic_write_text

LIBRARY_FILE = "library.toml"
FORMAT = "fullmark-library"
VERSION = 1
GITIGNORE = "progress.json\n*.tmp\n"


class LibraryError(Exception):
    """The folder is not a usable library."""


def is_library(path: Path) -> bool:
    return (Path(path) / LIBRARY_FILE).is_file()


def create(path: Path) -> None:
    path = Path(path)
    (path / "assets").mkdir(parents=True, exist_ok=True)
    (path / "quizzes").mkdir(exist_ok=True)
    now = datetime.now().replace(microsecond=0)
    # No `quiz` key while there are no quizzes: readers treat it as missing = empty.
    data = {"format": FORMAT, "version": VERSION, "created": now}
    atomic_write_text(path / LIBRARY_FILE, tomli_w.dumps(data))
    ignore = path / ".gitignore"
    if not ignore.exists():
        atomic_write_text(ignore, GITIGNORE)


def load(path: Path) -> dict:
    file = Path(path) / LIBRARY_FILE
    try:
        text = file.read_text(encoding="utf-8")
    except FileNotFoundError as exc:
        raise LibraryError(f"{file} is missing") from exc
    except (OSError, UnicodeDecodeError) as exc:
        raise LibraryError(f"cannot read {file}: {exc}") from exc
    try:
        data = tomllib.loads(text)
    except tomllib.TOMLDecodeError as exc:
        raise LibraryError(f"{file} is not valid TOML: {exc}") from exc
    if data.get("format") != FORMAT:
        raise LibraryError(
            f"{file} has format {data.get('format')!r}, expected {FORMAT!r}"
        )
    version = data.get("version")
    if not isinstance(version, int) or isinstance(version, bool):
        raise LibraryError(f"{file} has no valid version")
    if version > VERSION:
        raise LibraryError(
            f"{file} is version {version}, made by a newer fullmark (this one reads "
            f"version {VERSION}); upgrade fullmark"
        )
    return data


def save(path: Path, data: dict) -> None:
    """Write `library.toml` atomically."""
    atomic_write_text(Path(path) / LIBRARY_FILE, tomli_w.dumps(data))
