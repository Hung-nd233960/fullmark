"""Git for the library: the tool writes commits, the user reads them.

No function here raises. Every failure becomes a warning string."""

from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path

NO_IDENTITY = (
    'no git identity; run git config --global user.name "..." and user.email '
    "to let fullmark commit"
)


def available() -> bool:
    return shutil.which("git") is not None


def _run(path: Path, *args: str) -> subprocess.CompletedProcess | None:
    try:
        return subprocess.run(
            ["git", "-C", str(path), *args],
            capture_output=True,
            check=False,
            text=True,
            timeout=30,
            env=os.environ | {"GIT_TERMINAL_PROMPT": "0"},
        )
    except (OSError, subprocess.SubprocessError):
        return None


def _first_line(text: str) -> str:
    lines = text.strip().splitlines()
    return lines[0] if lines else "unknown error"


def toplevel(path: Path) -> Path | None:
    """The root of the repository that contains `path`, or None."""
    if not available():
        return None
    r = _run(path, "rev-parse", "--show-toplevel")
    if r is None or r.returncode != 0 or not r.stdout.strip():
        return None
    return Path(r.stdout.strip()).resolve()


def owns_repo(library: Path) -> bool:
    """True when the library folder is itself the root of a repository."""
    return toplevel(library) == Path(library).resolve()


def init(path: Path) -> list[str]:
    if not available():
        return ["git is not installed; the library has no history"]
    top = toplevel(path)
    if top is not None:
        return [
            (
                f"{path} is inside the git repository {top}; no repository was made, "
                "and fullmark will not commit"
            )
        ]
    r = _run(path, "init", "-q")
    if r is None or r.returncode != 0:
        detail = _first_line(r.stderr) if r is not None else "git did not run"
        return [f"git init failed: {detail}"]
    return []


def commit(library: Path, message: str) -> tuple[bool, list[str]]:
    if not available() or not owns_repo(library):
        return False, []
    for key in ("user.name", "user.email"):
        r = _run(library, "config", key)
        if r is None or r.returncode != 0 or not r.stdout.strip():
            return False, [NO_IDENTITY]
    r = _run(library, "add", "-A")
    if r is None or r.returncode != 0:
        detail = _first_line(r.stderr) if r is not None else "git did not run"
        return False, [f"git commit failed: {detail}"]
    r = _run(library, "commit", "-q", "-m", message)
    if r is None:
        return False, ["git commit failed: git did not run"]
    if r.returncode == 0:
        return True, []
    if "nothing to commit" in (r.stdout + r.stderr).lower():
        return False, []
    return False, [f"git commit failed: {_first_line(r.stderr or r.stdout)}"]


def dirty_path(library: Path, rel: str) -> bool:
    """True when `git status` shows changes under `rel` (a path inside the library)."""
    if not available():
        return False
    r = _run(library, "status", "--porcelain", "--", rel)
    return bool(r is not None and r.returncode == 0 and r.stdout.strip())


def status(library: Path) -> dict:
    out = {
        "available": available(),
        "repo": "none",
        "toplevel": None,
        "dirty": None,
        "remote": None,
    }
    if not out["available"]:
        return out
    top = toplevel(library)
    if top is None:
        return out
    out["toplevel"] = top.as_posix()
    if top != Path(library).resolve():
        out["repo"] = "outer"
        return out
    out["repo"] = "own"
    r = _run(library, "status", "--porcelain")
    out["dirty"] = bool(r is not None and r.returncode == 0 and r.stdout.strip())
    r = _run(library, "remote")
    out["remote"] = bool(r is not None and r.returncode == 0 and r.stdout.strip())
    return out
