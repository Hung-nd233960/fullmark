"""The repository is public: no tracked file may carry the author's personal paths."""

import re
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).parent.parent

# Written as character classes so this file does not match its own patterns.
PERSONAL = re.compile(
    r"C:[\\/]+Users[\\/]+DELL"
    r"|D:[\\/]+coding-project[s]"
    r"|D:[\\/]+studyin[g]"
    r"|Setups-priv[a]te"
    r"|cli-guide-agent[s]",
    re.IGNORECASE,
)


def test_no_personal_paths_in_tracked_files():
    listing = subprocess.run(
        ["git", "ls-files"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=False,
    )
    if listing.returncode != 0:
        pytest.skip("not a git checkout (an sdist has no file list)")
    files = listing.stdout.splitlines()
    found = []
    for name in files:
        try:
            text = (ROOT / name).read_text(encoding="utf-8")
        except (UnicodeDecodeError, FileNotFoundError):
            continue  # binary files, or a file staged for deletion
        for number, line in enumerate(text.splitlines(), 1):
            match = PERSONAL.search(line)
            if match:
                found.append(f"{name}:{number}: {match.group(0)}")
    assert not found, "personal paths in tracked files:\n" + "\n".join(found)
