"""Copy the packaged templates to examples/ and rebuild the HTML.

The packaged files in src/fullmark/examples/ are the source. The top-level
examples/ folder holds copies for readers, so run this after editing a
packaged example, quiz.css or quiz.js. It also copies the packaged
src/fullmark/agents.md to AGENTS.md, which tools look for at the repo root.

    uv run python scripts/sync_examples.py
"""

import shutil
import sys
from pathlib import Path

from fullmark.cli import main
from fullmark.templates_cmd import EXAMPLES, PKG, TEMPLATES

ROOT = Path(__file__).parent.parent
OUT = ROOT / "examples"
SYNCED = [name for name in TEMPLATES if name != "blank"]  # blank has no readers' copy


def sync() -> int:
    shutil.copyfile(PKG / "agents.md", ROOT / "AGENTS.md")
    for name in SYNCED:
        t = TEMPLATES[name]
        dest = OUT / name
        dest.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(EXAMPLES / t.file, dest / "quiz.md")
        for asset in t.assets:
            (dest / "assets").mkdir(exist_ok=True)
            shutil.copyfile(EXAMPLES / "assets" / asset, dest / "assets" / asset)
        code = main(["build", str(dest / "quiz.md")])
        if code:
            return code
    return 0


if __name__ == "__main__":
    sys.exit(sync())
