"""Small file helpers."""

from __future__ import annotations

import contextlib
import hashlib
import os
import stat
import tempfile
from pathlib import Path


def atomic_write_text(path: Path, text: str) -> None:
    """Write `text` (UTF-8, LF) to `path` through a temp file in the same folder."""
    path = Path(path)
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=path.name + ".", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as fh:
            fh.write(text)
        os.replace(tmp, path)
    except BaseException:
        with contextlib.suppress(OSError):
            os.unlink(tmp)
        raise


def atomic_write_bytes(path: Path, data: bytes) -> None:
    """Write `data` to `path` through a temp file in the same folder."""
    path = Path(path)
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=path.name + ".", suffix=".tmp")
    try:
        with os.fdopen(fd, "wb") as fh:
            fh.write(data)
        os.replace(tmp, path)
    except BaseException:
        with contextlib.suppress(OSError):
            os.unlink(tmp)
        raise


def make_read_only(path: Path) -> None:
    """Set the read-only attribute (on Windows) or clear the write bits (elsewhere)."""
    os.chmod(path, stat.S_IREAD)


def make_writable(path: Path) -> None:
    os.chmod(path, stat.S_IREAD | stat.S_IWRITE)


def write_read_only(path: Path, data: bytes) -> None:
    """Write a file that exists to be kept: replaces an earlier copy, ends read-only."""
    path = Path(path)
    if path.exists():
        make_writable(path)
    atomic_write_bytes(path, data)
    make_read_only(path)


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()
