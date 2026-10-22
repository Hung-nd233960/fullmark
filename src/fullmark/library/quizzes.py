"""The registry: ids, names, lookup, snapshots, the asset store and staged builds."""

from __future__ import annotations

import contextlib
import json
import re
import secrets
import tempfile
import tomllib
import unicodedata
from collections.abc import Generator
from datetime import datetime
from pathlib import Path, PurePosixPath

import tomli_w

from ..build import build_html
from ..models import Quiz
from ..parser import read_source, source_hash
from ..validate import load_quiz, media_refs
from .fsutil import make_writable, sha256_bytes, write_read_only

ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz234567"
NAME_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,39}$")
NAME_RULE = (
    "a name is 1 to 40 characters: lowercase letters, digits and hyphens, "
    "starting with a letter or digit"
)
VERSION_SUFFIXES = (".md", ".assets.toml", ".brief.yaml")
_DRIVE_RE = re.compile(r"^[a-zA-Z]:")


class QuizError(Exception):
    """A registry problem the user can fix; the message is shown as is."""


class NotFound(QuizError):
    pass


class Ambiguous(QuizError):
    pass


class RefError(QuizError):
    """A media reference that does not stay inside the quiz folder."""

    def __init__(self, ref: str, line: int):
        super().__init__(ref)
        self.ref = ref
        self.line = line


# ------------------------------------------------------------------ names


def entries_of(data: dict) -> list[dict]:
    raw = data.get("quiz", [])
    return [e for e in raw if isinstance(e, dict)] if isinstance(raw, list) else []


def new_id(existing: set[str]) -> str:
    while True:
        qid = "".join(secrets.choice(ID_ALPHABET) for _ in range(6))
        if qid not in existing:
            return qid


# A default name is short enough to type; -n sets any name up to 40 characters.
SLUG_MAX = 24


def slugify(title: str) -> str:
    text = title.replace("đ", "d").replace("Đ", "D")
    text = unicodedata.normalize("NFKD", text)
    text = "".join(c for c in text if not unicodedata.combining(c))
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    if len(slug) > SLUG_MAX:
        cut = slug[:SLUG_MAX]
        slug = (cut.rsplit("-", 1)[0] if "-" in cut[1:] else cut).strip("-")
    return slug or "quiz"


def free_name(base: str, taken: set[str]) -> str:
    if base not in taken:
        return base
    n = 2
    while True:
        suffix = f"-{n}"
        candidate = base[: 40 - len(suffix)].rstrip("-") + suffix
        if candidate not in taken:
            return candidate
        n += 1


def lookup(data: dict, text: str) -> dict:
    entries = entries_of(data)
    for e in entries:
        if e.get("name") == text:
            return e
    for e in entries:
        if e.get("id") == text:
            return e
    if len(text) >= 3:
        found = [e for e in entries if str(e.get("id", "")).startswith(text)]
        if len(found) == 1:
            return found[0]
        if len(found) > 1:
            names = ", ".join(f"{e.get('name')} ({e.get('id')})" for e in found)
            raise Ambiguous(f"{text!r} matches more than one quiz: {names}")
    raise NotFound(f"no quiz named {text!r}; see quiz library list")


# ------------------------------------------------------------------ references


def portable_ref(ref: str) -> str | None:
    """The reference with `/` separators when it stays inside the quiz folder, else None."""
    if _DRIVE_RE.match(ref) or ref.startswith(("/", "\\")):
        return None
    slashed = ref.replace("\\", "/")
    parts = PurePosixPath(slashed).parts
    depth = 0
    for part in parts:
        if part == "..":
            depth -= 1
            if depth < 0:
                return None
        elif part != ".":
            depth += 1
    return slashed


def collect_assets(text: str, base_dir: Path) -> dict[str, bytes]:
    """Reference (as written, `/`-separated) to file bytes, for every media reference.

    Raises RefError for a reference outside the folder and OSError for a missing file."""
    out: dict[str, bytes] = {}
    for _alt, ref in media_refs(text):
        key = portable_ref(ref)
        if key is None:
            line = next((n for n, ln in enumerate(text.split("\n"), 1) if ref in ln), 1)
            raise RefError(ref, line)
        if key not in out:
            out[key] = (base_dir / key).read_bytes()
    return out


def asset_name(ref: str, sha: str) -> str:
    return sha + PurePosixPath(ref.split("?")[0]).suffix.lower()


def asset_map(assets: dict[str, bytes]) -> dict[str, str]:
    return {ref: sha256_bytes(data) for ref, data in assets.items()}


def hash_of_bytes(raw: bytes) -> str:
    text = raw.decode("utf-8-sig").replace("\r\n", "\n").replace("\r", "\n")
    return source_hash(text)


# ------------------------------------------------------------------ files


def qdir(library: Path, qid: str) -> Path:
    return Path(library) / "quizzes" / qid


def vpath(library: Path, qid: str, hash_: str, suffix: str) -> Path:
    return qdir(library, qid) / "versions" / f"{hash_}{suffix}"


def read_version(
    library: Path, qid: str, hash_: str
) -> tuple[bytes, dict, bytes | None]:
    """The snapshot bytes, the asset map and the brief bytes (or None) of a version."""
    md = vpath(library, qid, hash_, ".md").read_bytes()
    amap = tomllib.loads(
        vpath(library, qid, hash_, ".assets.toml").read_text(encoding="utf-8")
    ).get("assets", {})
    brief_file = vpath(library, qid, hash_, ".brief.yaml")
    brief = brief_file.read_bytes() if brief_file.is_file() else None
    return md, amap, brief


def write_version(
    library: Path,
    qid: str,
    hash_: str,
    md: bytes,
    assets: dict[str, bytes],
    brief: bytes | None,
) -> None:
    """Store the assets (once per content), then the read-only version files."""
    library = Path(library)
    (library / "assets").mkdir(exist_ok=True)
    amap = asset_map(assets)
    for ref, data in assets.items():
        target = library / "assets" / asset_name(ref, amap[ref])
        if not target.exists():
            write_read_only(target, data)
    (qdir(library, qid) / "versions").mkdir(parents=True, exist_ok=True)
    write_read_only(vpath(library, qid, hash_, ".md"), md)
    toml = tomli_w.dumps({"assets": amap}).encode("utf-8")
    write_read_only(vpath(library, qid, hash_, ".assets.toml"), toml)
    brief_file = vpath(library, qid, hash_, ".brief.yaml")
    if brief is not None:
        write_read_only(brief_file, brief)
    elif brief_file.exists():
        make_writable(brief_file)
        brief_file.unlink()


def remove_version(library: Path, qid: str, hash_: str) -> None:
    for suffix in VERSION_SUFFIXES:
        p = vpath(library, qid, hash_, suffix)
        if p.exists():
            make_writable(p)
            p.unlink()


# ------------------------------------------------------------------ staging and building


def read_assets(library: Path, amap: dict) -> dict[str, bytes]:
    """The bytes of every asset in a version's map, by reference."""
    return {
        ref: (Path(library) / "assets" / asset_name(ref, sha)).read_bytes()
        for ref, sha in amap.items()
    }


def write_stage(
    dest: Path,
    file_name: str,
    md: bytes,
    assets: dict[str, bytes],
    brief: bytes | None,
) -> Path:
    """Lay a version out as a quiz folder: the source under its original file name,
    each asset at the path the Markdown uses, and brief.yaml when there is one."""
    dest = Path(dest)
    path = dest / file_name
    path.write_bytes(md)
    for ref, data in assets.items():
        target = dest / ref
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
    if brief is not None:
        (dest / "brief.yaml").write_bytes(brief)
    return path


def version_of(entry: dict, hash_: str) -> dict:
    for v in entry.get("versions", []):
        if isinstance(v, dict) and v.get("hash") == hash_:
            return v
    raise NotFound(f"{entry.get('name')} has no version {hash_}")


@contextlib.contextmanager
def stage(library: Path, entry: dict, hash_: str) -> Generator[Path]:
    """Yield the staged `.md` of a stored version, in a temp folder that is removed after."""
    ver = version_of(entry, hash_)
    md, amap, brief = read_version(library, str(entry["id"]), hash_)
    assets = read_assets(library, amap)
    with tempfile.TemporaryDirectory(prefix="fullmark-stage-") as tmp:
        yield write_stage(Path(tmp), str(ver.get("file", "quiz.md")), md, assets, brief)


def build_staged(path: Path, expected_hash: str | None = None) -> tuple[Quiz, str]:
    """Check and build a staged quiz. Returns the quiz and the HTML.

    Raises QuizError on errors, or when the staged copy hashes differently."""
    quiz, findings, _text = load_quiz(path)
    if quiz is None or findings.has_errors:
        first = next((f.format() for f in findings if f.severity == "error"), "")
        raise QuizError(f"the staged copy does not check: {first}")
    if expected_hash is not None and quiz.source_hash != expected_hash:
        raise QuizError(
            f"the staged copy has hash {quiz.source_hash}, expected {expected_hash}"
        )
    result = build_html(quiz, path.parent)
    if result.errors:
        raise QuizError("build failed: " + "; ".join(result.errors))
    return quiz, result.html


# ------------------------------------------------------------------ results


def read_results(library: Path, qid: str) -> list[dict]:
    """One dict per results file: `path`, `data` (None when unreadable), `mtime`."""
    out = []
    folder = qdir(library, qid) / "results"
    for p in sorted(folder.glob("*.json")) if folder.is_dir() else []:
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
            if not isinstance(data, dict):
                data = None
        except (OSError, ValueError):
            data = None
        try:
            mtime = p.stat().st_mtime
        except OSError:
            mtime = 0.0
        out.append({"path": p, "data": data, "mtime": mtime})
    return out


def attempts_for(library: Path, qid: str, hash_: str) -> int:
    n = 0
    for r in read_results(library, qid):
        quiz = (r["data"] or {}).get("quiz")
        if isinstance(quiz, dict) and quiz.get("hash") == hash_:
            n += 1
    return n


def _when(result: dict) -> datetime:
    att = (result["data"] or {}).get("attempt") or {}
    for key in ("submitted_at", "started_at"):
        value = att.get(key)
        if isinstance(value, str) and value:
            try:
                dt = datetime.fromisoformat(value)
            except ValueError:
                continue
            return dt.astimezone()
    return datetime.fromtimestamp(result["mtime"]).astimezone()


def summarize(library: Path, entry: dict) -> dict:
    """The facts `list` shows about one quiz."""
    results = read_results(library, str(entry.get("id", "")))
    row = {
        "attempts": len(results),
        "last_taken": None,
        "last_score": None,
        "mode": None,
    }
    if results:
        newest = max(results, key=_when)
        row["last_taken"] = _when(newest).isoformat(timespec="seconds")
        data = newest["data"] or {}
        mode = (data.get("attempt") or {}).get("mode")
        row["mode"] = mode
        pct = (data.get("score") or {}).get("percent_auto")
        if mode != "survey" and isinstance(pct, (int, float)):
            row["last_score"] = pct
    return row


def source_note(library: Path, entry: dict) -> str | None:
    """`source changed` when the recorded source exists and differs from `current`."""
    src = entry.get("source")
    if not isinstance(src, str) or not src:
        return None
    path = Path(src)
    if not path.is_file():
        return None
    current = str(entry.get("current", ""))
    try:
        text = read_source(path)
    except (OSError, UnicodeDecodeError):
        return "source changed (has errors)"
    if source_hash(text) != current:
        return "source changed"
    try:
        _md, amap, brief = read_version(library, str(entry["id"]), current)
        now = collect_assets(text, path.parent)
    except (OSError, ValueError, RefError, KeyError):
        return "source changed (has errors)"
    brief_file = path.parent / "brief.yaml"
    now_brief = brief_file.read_bytes() if brief_file.is_file() else None
    if asset_map(now) != amap or now_brief != brief:
        return "source changed"
    return None
