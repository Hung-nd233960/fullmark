"""quiz library init and status: config, library folder and git. No browser."""

import hashlib
import json
import os
import re
import shutil
import socket
import stat
import subprocess
import sys
import threading
import tomllib
from argparse import Namespace
from pathlib import Path

import pytest
from helpers import correct_response, validate_results
from test_report import SURVEY_RESPONSES, make_results
from test_review import EXAMPLES, QUIZ, item, review_doc
from test_review import write_quiz as write_md
from test_serve import Running, injected, progress_body

from fullmark.cli import main
from fullmark.library import commands, config, quizzes, store
from fullmark.library.fsutil import make_writable
from fullmark.review import block_hashes
from fullmark.serve import quiz_meta_of_html
from fullmark.validate import load_quiz

FIX = Path(__file__).parent / "fixtures"
HAS_GIT = shutil.which("git") is not None
needs_git = pytest.mark.skipif(not HAS_GIT, reason="git is not installed")


def run(capsys, *argv):
    code = main(["library", *argv])
    cap = capsys.readouterr()
    return code, cap.out, cap.err


def git_out(path, *args):
    r = subprocess.run(
        ["git", "-C", str(path), *args], capture_output=True, text=True, check=False
    )
    return r.stdout.strip()


def commit_count(path):
    return int(git_out(path, "rev-list", "--all", "--count") or 0)


def configured():
    return config.load_config()["library"]["path"]


# ------------------------------------------------------------------ config


def test_config_path_env_wins(monkeypatch, tmp_path):
    monkeypatch.setenv("FULLMARK_CONFIG", str(tmp_path / "x.toml"))
    monkeypatch.setenv("XDG_CONFIG_HOME", str(tmp_path / "xdg"))
    assert config.config_path() == tmp_path / "x.toml"


def test_config_path_per_os(monkeypatch, tmp_path):
    home = tmp_path / "home"
    monkeypatch.setattr(config.Path, "home", lambda: home)
    monkeypatch.delenv("FULLMARK_CONFIG", raising=False)
    monkeypatch.delenv("XDG_CONFIG_HOME", raising=False)
    tail = Path("fullmark") / "config.toml"

    appdata = tmp_path / "appdata"
    monkeypatch.setenv("APPDATA", str(appdata))
    monkeypatch.setattr(sys, "platform", "win32")
    assert config.config_path() == appdata / tail
    monkeypatch.delenv("APPDATA")
    assert config.config_path() == home / "AppData" / "Roaming" / tail

    monkeypatch.setattr(sys, "platform", "darwin")
    assert config.config_path() == home / "Library" / "Application Support" / tail

    monkeypatch.setattr(sys, "platform", "linux")
    assert config.config_path() == home / ".config" / tail
    monkeypatch.setenv("XDG_CONFIG_HOME", str(tmp_path / "xdg"))
    assert config.config_path() == tmp_path / "xdg" / tail
    # An XDG setting is honoured on Windows too.
    monkeypatch.setattr(sys, "platform", "win32")
    assert config.config_path() == tmp_path / "xdg" / tail


def test_save_config_keeps_unknown_keys_and_leaves_no_temp(lib):
    path = config.config_path()
    path.parent.mkdir(parents=True)
    path.write_text(
        'theme = "dark"\n[library]\npath = "x"\nextra = 1\n[other]\na = "b"\n'
    )
    data = config.load_config()
    data["library"]["path"] = "y"
    config.save_config(data)
    again = config.load_config()
    assert again["theme"] == "dark"
    assert again["library"] == {"path": "y", "extra": 1}
    assert again["other"] == {"a": "b"}
    assert [p.name for p in path.parent.iterdir()] == ["config.toml"]


def test_bad_config_is_an_error(lib, capsys):
    path = config.config_path()
    path.parent.mkdir(parents=True)
    path.write_text("[library\n")
    with pytest.raises(config.ConfigError):
        config.load_config()
    code, _out, err = run(capsys, "init")
    assert code == 2
    assert "config.toml" in err


# ------------------------------------------------------------------ init


@needs_git
def test_init_makes_the_current_folder_the_library(lib, capsys):
    code, out, _ = run(capsys, "init")
    assert code == 0
    root = lib / "work"
    data = store.load(root)
    assert data["format"] == "fullmark-library"
    assert data["version"] == 1
    assert "created" in data
    assert "quiz" not in data
    assert (root / "assets").is_dir() and (root / "quizzes").is_dir()
    assert (root / ".gitignore").read_text() == "progress.json\n*.tmp\n"
    assert configured() == root.resolve().as_posix()
    assert str(config.config_path()) in out


def test_init_in_a_non_empty_folder_refuses_and_writes_nothing(lib, capsys):
    work = lib / "work"
    for i in range(12):
        (work / f"note{i:02}.txt").write_bytes(f"line {i}\r\nx".encode())
    before = {p.name: p.read_bytes() for p in work.iterdir()}
    code, out, err = run(capsys, "init", "--no-git")
    assert code == 2
    assert "is not empty and is not a library" in err
    assert f"{work.resolve().as_posix()}/fullmark-library" in err
    assert "note00.txt" in err and "and 2 more" in err
    assert not store.is_library(work)
    assert not config.config_path().exists()
    assert {p.name: p.read_bytes() for p in work.iterdir()} == before
    code, out, _ = run(capsys, "init", "--no-git", "--json")
    assert code == 2
    res = json.loads(out)
    assert res["status"] == "refused" and "not empty" in res["reason"]
    assert not config.config_path().exists()


def test_init_adopts_an_existing_library(lib, capsys):
    other = lib / "other"
    store.create(other)
    before = sorted(p.name for p in other.rglob("*"))
    code, out, _ = run(capsys, "init", str(other))
    assert code == 0
    assert "adopted" in out
    assert configured() == other.resolve().as_posix()
    assert sorted(p.name for p in other.rglob("*")) == before
    assert not (other / ".git").exists()


def test_second_init_elsewhere_is_refused_until_forced(lib, capsys):
    a, b = lib / "a", lib / "b"
    assert run(capsys, "init", str(a), "--no-git")[0] == 0
    cfg_before = config.config_path().read_text()
    a_before = sorted(p.name for p in a.rglob("*"))
    code, out, _ = run(capsys, "init", str(b), "--no-git")
    assert code == 2
    assert a.resolve().as_posix() in out and b.resolve().as_posix() in out
    assert "--force" in out
    assert config.config_path().read_text() == cfg_before
    assert not b.exists()
    code, _, _ = run(capsys, "init", str(b), "--no-git", "--force")
    assert code == 0
    assert configured() == b.resolve().as_posix()
    assert sorted(p.name for p in a.rglob("*")) == a_before


def test_init_again_on_the_configured_path_changes_nothing(lib, capsys):
    assert run(capsys, "init", "--no-git")[0] == 0
    cfg_before = config.config_path().read_text()
    code, out, _ = run(capsys, "init", "--json", "--no-git")
    assert code == 0
    assert json.loads(out)["status"] == "unchanged"
    assert config.config_path().read_text() == cfg_before


def test_a_deleted_configured_library_does_not_block_init(lib, capsys):
    old = lib / "old"
    assert run(capsys, "init", str(old), "--no-git")[0] == 0
    shutil.rmtree(old)
    code, out, _ = run(capsys, "init", str(lib / "new"), "--no-git")
    assert code == 0
    assert "no longer exists" in out
    assert configured() == (lib / "new").resolve().as_posix()


def test_init_on_a_file_fails_cleanly(lib, capsys):
    f = lib / "file.txt"
    f.write_text("x")
    code, _, err = run(capsys, "init", str(f))
    assert code == 2
    assert "quiz library init:" in err


def test_init_warns_when_fullmark_library_is_set(lib, capsys, monkeypatch):
    monkeypatch.setenv("FULLMARK_LIBRARY", str(lib / "elsewhere"))
    code, out, _ = run(capsys, "init", "--no-git")
    assert code == 0
    assert "FULLMARK_LIBRARY" in out


def test_init_json_prints_only_json(lib, capsys):
    code, out, err = run(capsys, "init", "--json", "--no-git")
    assert code == 0
    data = json.loads(out)
    assert set(data) == {"status", "path", "config", "git", "warnings"}
    assert data["status"] == "created"
    assert set(data["git"]) == {"repo", "committed"}
    assert "config:" in err


# ------------------------------------------------------------------ git


@needs_git
def test_init_makes_one_commit_with_gitignore_tracked(lib, capsys):
    code, out, _ = run(capsys, "init", "--json")
    assert code == 0
    assert json.loads(out)["git"] == {"repo": "own", "committed": True}
    root = lib / "work"
    assert commit_count(root) == 1
    assert ".gitignore" in git_out(root, "ls-files").split()
    assert "library.toml" in git_out(root, "ls-files").split()


@needs_git
def test_a_library_made_with_no_git_commits_once_git_init_is_run_by_hand(lib, capsys):
    library = lib / "library"
    assert run(capsys, "init", str(library), "--no-git")[0] == 0
    code, out, _ = run(capsys, "status", "--plain")
    assert f'to add it, run: git -C "{library.resolve()}" init' in out
    subprocess.run(["git", "-C", str(library), "init", "-q"], check=True)
    code, res, _ = reg_json(capsys, str(calc(lib)))
    assert code == 0 and res["committed"] is True
    assert commit_count(library) == 1


def test_no_git_makes_no_repository(lib, capsys):
    run(capsys, "init", "--no-git")
    assert not (lib / "work" / ".git").exists()


@needs_git
def test_inside_another_repository_nothing_is_nested_or_committed(lib, capsys):
    outer = lib / "outer"
    outer.mkdir()
    subprocess.run(["git", "-C", str(outer), "init", "-q"], check=True)
    inner = outer / "lib"
    code, out, _ = run(capsys, "init", str(inner))
    assert code == 0
    assert not (inner / ".git").exists()
    assert commit_count(outer) == 0
    assert "inside the git repository" in out


def test_init_without_git_installed_succeeds_and_warns(lib, capsys, monkeypatch):
    monkeypatch.setattr("fullmark.library.git.shutil.which", lambda name: None)
    code, out, _ = run(capsys, "init")
    assert code == 0
    assert "git is not installed" in out
    assert store.is_library(lib / "work")


@needs_git
def test_init_without_a_git_identity_makes_no_commit(lib, capsys, monkeypatch):
    empty = lib / "empty-gitconfig"
    empty.write_text("")
    monkeypatch.setenv("GIT_CONFIG_GLOBAL", str(empty))
    for var in ("GIT_AUTHOR_NAME", "GIT_AUTHOR_EMAIL", "EMAIL"):
        monkeypatch.delenv(var, raising=False)
    code, out, _ = run(capsys, "init", "--json")
    assert code == 0
    data = json.loads(out)
    assert data["git"]["committed"] is False
    assert any("git config" in w for w in data["warnings"])
    assert commit_count(lib / "work") == 0


# ------------------------------------------------------------------ status


def test_status_with_no_library(lib, capsys):
    code, out, err = run(capsys, "status")
    assert code == 2
    assert "quiz library init" in out + err
    code, out, _ = run(capsys, "status", "--json")
    assert code == 2
    assert json.loads(out)["status"] == "no_library"


def test_status_with_a_missing_library_folder(lib, capsys):
    config.save_config({"library": {"path": (lib / "gone").as_posix()}})
    code, out, _ = run(capsys, "status", "--json")
    assert code == 1
    data = json.loads(out)
    assert data["status"] == "problems"
    assert any("missing" in p for p in data["problems"])


@needs_git
def test_status_of_a_healthy_library(lib, capsys):
    run(capsys, "init")
    code, out, _ = run(capsys, "status", "--json")
    assert code == 0
    data = json.loads(out)
    assert data["status"] == "ok"
    assert data["git"]["repo"] == "own"
    assert data["git"]["dirty"] is False
    assert any(w.startswith("no remote") for w in data["warnings"])
    assert data["counts"] == {
        "quizzes": 0,
        "versions": 0,
        "attempts": 0,
        "in_progress": 0,
        "assets": 0,
        "unused_assets": 0,
    }
    assert "assets" not in data
    assert data["library"]["writable"] is True
    assert data["library"]["source"] == "config"
    code, out, _ = run(capsys, "status")
    assert code == 0
    assert "git: own repository" in out
    assert "warning: no remote" in out


def test_status_reports_folders_without_entries_and_counts_files(lib, capsys):
    run(capsys, "init", "--no-git")
    folder = lib / "work" / "quizzes" / "abc123"
    (folder / "results").mkdir(parents=True)
    (folder / "results" / "20261022-101500.json").write_text("{}")
    (folder / "progress.json").write_text("{}")
    code, out, _ = run(capsys, "status", "--json")
    assert code == 1
    data = json.loads(out)
    assert any("abc123" in p for p in data["problems"])
    assert data["counts"]["attempts"] == 1
    assert data["counts"]["in_progress"] == 1


def test_status_reports_an_entry_without_a_folder(lib, capsys):
    run(capsys, "init", "--no-git")
    toml = lib / "work" / "library.toml"
    toml.write_text(
        toml.read_text()
        + '\n[[quiz]]\nid = "k7f3q2"\nname = "calc"\n[[quiz.versions]]\nhash = "a1"\n'
    )
    code, out, _ = run(capsys, "status", "--json")
    assert code == 1
    data = json.loads(out)
    assert any("calc" in p for p in data["problems"])
    assert data["counts"]["quizzes"] == 1 and data["counts"]["versions"] == 1


def test_status_uses_fullmark_library_with_a_warning(lib, capsys, monkeypatch):
    run(capsys, "init", "--no-git")
    other = lib / "other"
    store.create(other)
    monkeypatch.setenv("FULLMARK_LIBRARY", str(other))
    _code, out, _ = run(capsys, "status", "--json")
    data = json.loads(out)
    assert data["library"]["path"] == other.as_posix()
    assert data["library"]["source"] == "FULLMARK_LIBRARY"
    assert any("FULLMARK_LIBRARY" in w for w in data["warnings"])


def test_status_flags_a_newer_library_version(lib, capsys):
    run(capsys, "init", "--no-git")
    toml = lib / "work" / "library.toml"
    toml.write_text(toml.read_text().replace("version = 1", "version = 99"))
    code, out, _ = run(capsys, "status", "--json")
    assert code == 1
    assert any("upgrade" in p for p in json.loads(out)["problems"])


def test_library_alone_exits_2(lib, capsys):
    try:
        code = main(["library"])
    except SystemExit as exc:
        code = exc.code
    assert code == 2


# ------------------------------------------------------------------ register and list

NO_EXPLANATION = """---
title: Bare
id: bare
---

## What is 2 + 2?

- [ ] 3
- [x] 4
"""


def pic_line(ref):
    return f"\n![alt]({ref})\n"


def tiny(title="Tiny", extra=""):
    return QUIZ.replace("title: Review me", f"title: {title}") + extra


def make_library(capsys, lib):
    path = lib / "library"
    assert run(capsys, "init", str(path))[0] == 0
    return path


def calc(lib, folder="calc"):
    d = lib / folder
    d.mkdir()
    shutil.copy(EXAMPLES / "calculus-1.md", d / "quiz.md")
    shutil.copytree(EXAMPLES / "assets", d / "assets")
    return d / "quiz.md"


def register(capsys, *argv):
    return run(capsys, "register", *argv)


def reg_json(capsys, *argv):
    code, out, err = register(capsys, *argv, "--json")
    return code, (json.loads(out) if out.strip() else None), err


def tree(path):
    return {
        p.relative_to(path).as_posix(): p.read_bytes()
        for p in sorted(path.rglob("*"))
        if p.is_file() and ".git" not in p.relative_to(path).parts
    }


def entry_of(library, name=None):
    found = store.load(library)["quiz"]
    return found[0] if name is None else next(q for q in found if q["name"] == name)


def add_result(library, entry, hash_, percent=80, mode="quiz", name="20261022-101500"):
    folder = library / "quizzes" / entry["id"] / "results"
    folder.mkdir(parents=True, exist_ok=True)
    doc = {
        "format": "fullmark-results",
        "version": 1,
        "quiz": {"id": "x", "title": "x", "hash": hash_},
        "attempt": {
            "submitted": True,
            "mode": mode,
            "started_at": "2026-10-22T10:00:00Z",
            "submitted_at": "2026-10-22T10:15:00Z",
        },
        "score": {"earned": 1, "possible_auto": 1, "percent_auto": percent},
    }
    (folder / f"{name}.json").write_text(json.dumps(doc), encoding="utf-8")


@needs_git
def test_register_writes_the_snapshot_assets_and_one_commit(lib, capsys):
    library = make_library(capsys, lib)
    src = calc(lib)
    before = commit_count(library)
    code, res, _ = reg_json(capsys, str(src))
    assert code == 0
    assert res["status"] == "registered" and res["name_defaulted"] is True
    assert res["name"] == "calculus-i-derivatives"
    assert res["take"] == "quiz library take calculus-i-derivatives"
    assert res["version_count"] == 1 and res["committed"] is True
    entry = entry_of(library)
    assert entry["id"] == res["id"] and len(entry["id"]) == 6
    assert entry["title"] == "Calculus I: derivatives"
    assert entry["source"] == src.resolve().as_posix()
    assert entry["current"] == res["hash"] and "registered" in entry
    (ver,) = entry["versions"]
    assert ver["hash"] == res["hash"] and ver["file"] == "quiz.md" and "added" in ver
    vdir = library / "quizzes" / entry["id"] / "versions"
    assert (vdir / f"{res['hash']}.md").read_bytes() == src.read_bytes()
    amap = tomllib.loads((vdir / f"{res['hash']}.assets.toml").read_text("utf-8"))
    ((ref, sha),) = amap["assets"].items()
    assert ref == "assets/cubic.png"
    assert (library / "assets" / f"{sha}.png").is_file()
    assert not list(library.rglob("*.html"))
    for p in [*vdir.iterdir(), *(library / "assets").iterdir()]:
        assert not os.access(p, os.W_OK), p
    assert commit_count(library) == before + 1
    subject = git_out(library, "log", "-1", "--format=%s")
    assert subject.startswith("register: calculus-i-derivatives (registered,")


def test_the_brief_is_stored_only_when_there_is_one(lib, capsys):
    library = make_library(capsys, lib)
    a = write_md(lib / "a", tiny("Alpha"))
    b = write_md(lib / "b", tiny("Beta"))
    (lib / "a" / "brief.yaml").write_text("request: practice\n", encoding="utf-8")
    assert reg_json(capsys, str(a))[0] == 0
    assert reg_json(capsys, str(b))[0] == 0
    for title, expected in (("Alpha", True), ("Beta", False)):
        e = next(q for q in store.load(library)["quiz"] if q["title"] == title)
        vdir = library / "quizzes" / e["id"] / "versions"
        brief = vdir / f"{e['current']}.brief.yaml"
        assert brief.is_file() is expected
        if expected:
            assert brief.read_text("utf-8") == "request: practice\n"


def test_a_version_builds_from_the_library_after_the_source_is_gone(lib, capsys):
    library = make_library(capsys, lib)
    src = calc(lib)
    source_quiz = load_quiz(src)[0]
    assert source_quiz is not None
    source_id = source_quiz.id
    code, res, _ = reg_json(capsys, str(src))
    assert code == 0
    shutil.rmtree(src.parent)
    entry = entry_of(library)
    with quizzes.stage(library, entry, res["hash"]) as staged:
        assert staged.name == "quiz.md"
        quiz, html = quizzes.build_staged(staged, res["hash"])
    assert quiz.id == source_id and quiz.source_file == "quiz.md"
    assert "data:image" in html


def test_an_image_used_by_two_quizzes_is_stored_once(lib, capsys):
    library = make_library(capsys, lib)
    assert reg_json(capsys, str(calc(lib, "one")))[0] == 0
    two = calc(lib, "two")
    two.write_text(two.read_text("utf-8").replace("derivatives", "rules"), "utf-8")
    assert reg_json(capsys, str(two))[0] == 0
    assert len(store.load(library)["quiz"]) == 2
    assert len(list((library / "assets").iterdir())) == 1


def test_same_path_again_and_name_clash_are_refused(lib, capsys):
    make_library(capsys, lib)
    a = write_md(lib / "a", tiny("Same"))
    assert reg_json(capsys, str(a))[0] == 0
    code, _, err = register(capsys, str(a))
    assert code == 1
    assert "is registered as same" in err and "--update same" in err
    other = write_md(lib / "b", tiny("Same"))
    code, res, err = reg_json(capsys, str(other))
    assert code == 1
    assert res["suggested_name"] == "same-2"
    assert "-n same-2" in err
    assert reg_json(capsys, str(other), "-n", "same-2")[0] == 0


@needs_git
def test_update_unchanged_replaced_new_version_and_updated_assets(lib, capsys):
    library = make_library(capsys, lib)
    src = calc(lib)
    _, first, _ = reg_json(capsys, str(src))
    name = first["name"]
    snapshot = tree(library)
    commits = commit_count(library)

    code, res, _ = reg_json(capsys, str(src), "--update", name)
    assert code == 0 and res["status"] == "unchanged"
    assert tree(library) == snapshot and commit_count(library) == commits

    # An edit with no attempts replaces the version.
    src.write_text(src.read_text("utf-8").replace("Limits", "Limit"), "utf-8")
    code, res, _ = reg_json(capsys, str(src), "--update", name)
    assert res["status"] == "replaced" and res["version_count"] == 1
    assert res["hash"] != first["hash"]
    vdir = library / "quizzes" / first["id"] / "versions"
    assert not (vdir / f"{first['hash']}.md").exists()
    assert (vdir / f"{res['hash']}.md").is_file()
    assert commit_count(library) == commits + 1

    # A changed image with the same Markdown and no attempts: replaced in place.
    img = src.parent / "assets" / "cubic.png"
    img.write_bytes(img.read_bytes() + b"x")
    code, res2, _ = reg_json(capsys, str(src), "--update", name)
    assert res2["status"] == "replaced" and res2["hash"] == res["hash"]
    assert len(list((library / "assets").iterdir())) == 2

    # With an attempt on the current version, an edit adds a version ...
    add_result(library, entry_of(library), res["hash"])
    src.write_text(src.read_text("utf-8").replace("Limit", "Bound"), "utf-8")
    code, res3, _ = reg_json(capsys, str(src), "--update", name)
    assert res3["status"] == "new-version" and res3["version_count"] == 2
    assert entry_of(library)["current"] == res3["hash"]
    assert (vdir / f"{res['hash']}.md").is_file()
    assert (vdir / f"{res3['hash']}.md").is_file()

    # ... and a changed image alone rewrites the asset map of that version.
    add_result(library, entry_of(library), res3["hash"], name="20261022-111500")
    img.write_bytes(img.read_bytes() + b"y")
    code, res4, _ = reg_json(capsys, str(src), "--update", name)
    assert res4["status"] == "updated-assets" and res4["version_count"] == 2
    assert res4["hash"] == res3["hash"]
    toml = vdir / f"{res3['hash']}.assets.toml"
    amap = tomllib.loads(toml.read_text("utf-8"))
    assert (
        amap["assets"]["assets/cubic.png"]
        == hashlib.sha256(img.read_bytes()).hexdigest()
    )
    assert not os.access(toml, os.W_OK)


def test_refusals_leave_the_library_untouched(lib, capsys):
    library = make_library(capsys, lib)
    before = (tree(library), (library / "library.toml").read_bytes())

    bad = write_md(lib / "bad", "---\ntitle: Bad\n---\n\n## no choices\n")
    assert register(capsys, str(bad))[0] == 1

    bare = write_md(lib / "bare", NO_EXPLANATION)
    code, _, err = register(capsys, str(bare), "--strict")
    assert code == 1 and "--strict" in err

    q = write_md(lib / "rv", tiny("Reviewed"))
    quiz, _f, text = load_quiz(q)
    assert quiz is not None
    h = block_hashes(quiz, text)
    doc = review_doc(
        quiz,
        {
            "add": item(h, "add", "fix", "ask about 3 + 3"),
            "prime": item(h, "prime", "keep"),
            "sky": item(h, "sky", "keep"),
        },
    )
    rv = lib / "rv" / "review.json"
    rv.write_text(json.dumps(doc), encoding="utf-8")
    code, out, _ = register(capsys, str(q), "--review", str(rv))
    assert code == 1 and "[review.fix]" in out

    (lib / "x.png").write_bytes(b"png")
    (lib / "pic" / "a").mkdir(parents=True, exist_ok=True)
    refs = ["../x.png", "a/../../x.png"]
    if sys.platform == "win32":
        refs.append((lib / "x.png").as_posix())  # a drive letter
    for ref in refs:
        pic = write_md(lib / "pic", tiny("Pic", pic_line(ref)))
        code, _, err = register(capsys, str(pic))
        assert code == 1, ref
        assert f"error: {ref} is outside the quiz folder" in err
        assert "move it under the quiz folder" in err
    for ref in ("C:/nope.png", "/x.png"):  # not found, so the check refuses first
        pic = write_md(lib / "pic", tiny("Pic", pic_line(ref)))
        assert register(capsys, str(pic))[0] == 1
    assert quizzes.portable_ref("C:\\" + "x.png") is None
    assert quizzes.portable_ref("/x.png") is None
    assert quizzes.portable_ref("assets\\" + "a.png") == "assets/a.png"
    assert (tree(library), (library / "library.toml").read_bytes()) == before


def test_register_without_a_library_needs_input(lib, capsys):
    src = write_md(lib / "a", tiny())
    code, out, err = register(capsys, str(src))
    assert code == 3 and "quiz library init" in err
    code, out, _ = register(capsys, str(src), "--json")
    assert code == 3
    data = json.loads(out)
    assert data["status"] == "needs_input" and data["written"] is False
    assert data["missing"][0]["id"] == "library"
    assert data["fix"] == "quiz library init PATH"


def test_names_and_slugs(lib, capsys):
    make_library(capsys, lib)
    src = write_md(lib / "a", tiny())
    assert register(capsys, str(src), "-n", "Bad Name")[0] == 2
    assert register(capsys, str(src), "-n", "a" * 41)[0] == 2
    assert quizzes.slugify("Tín hiệu và Hệ thống: Tuần 3") == "tin-hieu-va-he-thong"
    assert quizzes.slugify("Đường đi") == "duong-di"
    assert quizzes.slugify("???") == "quiz"
    long = quizzes.slugify("word " * 20)
    assert (
        len(long) <= quizzes.SLUG_MAX
        and quizzes.NAME_RE.match(long)
        and not long.endswith("-")
    )
    assert (
        quizzes.slugify("Basic Radiobiology: exam practice (IAEA Ch. 2)")
        == "basic-radiobiology-exam"
    )
    assert quizzes.free_name("a", {"a", "a-2"}) == "a-3"
    ids = {quizzes.new_id(set()) for _ in range(50)}
    assert all(len(i) == 6 and set(i) <= set(quizzes.ID_ALPHABET) for i in ids)
    with pytest.raises(SystemExit) as exc:
        main(["library", "register", "-n", "x", "--update", "y", str(src)])
    assert exc.value.code == 2


def test_lookup_by_name_id_and_prefix(lib, capsys):
    library = make_library(capsys, lib)
    src = write_md(lib / "a", tiny("Alpha"))
    _, res, _ = reg_json(capsys, str(src))
    for text in (res["name"], res["id"], res["id"][:3]):
        assert reg_json(capsys, str(src), "--update", text)[1]["status"] == "unchanged"
    assert register(capsys, str(src), "--update", res["id"][:2])[0] == 2
    code, _, err = register(capsys, str(src), "--update", "nope")
    assert code == 2 and "no quiz named 'nope'" in err
    data = store.load(library)
    twin = dict(data["quiz"][0], id="zzz111", name="twin")
    data["quiz"][0]["id"] = "zzz222"
    data["quiz"].append(twin)
    store.save(library, data)
    code, _, err = register(capsys, str(src), "--update", "zzz")
    assert code == 2 and "twin (zzz111)" in err and "(zzz222)" in err
    assert quizzes.lookup(data, "zzz1")["name"] == "twin"


def test_list_empty_and_without_a_library(lib, capsys):
    code, _out, err = run(capsys, "list")
    assert code == 2 and "quiz library init" in err
    make_library(capsys, lib)
    code, out, _ = run(capsys, "list")
    assert code == 0 and "No quizzes yet" in out
    code, out, _ = run(capsys, "list", "--json")
    assert code == 0 and json.loads(out) == []


def test_list_rows_scores_modes_and_source_changes(lib, capsys):
    library = make_library(capsys, lib)
    a = write_md(lib / "a", tiny("Alpha"))
    b = write_md(lib / "b", tiny("Beta"))
    c = write_md(lib / "c", tiny("Gamma"))
    for src in (a, b, c):
        assert reg_json(capsys, str(src))[0] == 0
    alpha, beta = entry_of(library, "alpha"), entry_of(library, "beta")
    add_result(library, alpha, alpha["current"], percent=82.6)
    add_result(library, beta, beta["current"], percent=0, mode="survey")
    add_result(library, beta, beta["current"], percent=0, mode="survey", name="x2")
    _code, out, _ = run(capsys, "list", "--json")
    rows = json.loads(out)
    assert [r["name"] for r in rows] == ["alpha", "beta", "gamma"]
    alpha_row, beta_row, gamma_row = rows
    assert set(alpha_row) == {
        "name",
        "id",
        "title",
        "versions",
        "attempts",
        "last_taken",
        "last_score",
        "mode",
        "note",
    }
    assert alpha_row["attempts"] == 1 and alpha_row["last_score"] == 82.6
    assert alpha_row["last_taken"].startswith("2026-10-22")
    assert beta_row["attempts"] == 2 and beta_row["mode"] == "survey"
    assert beta_row["last_score"] is None
    assert gamma_row["attempts"] == 0 and gamma_row["last_taken"] is None
    assert all(r["note"] is None for r in rows)
    _code, out, _ = run(capsys, "list")
    lines = out.splitlines()
    assert lines[0].split()[:3] == ["id", "name", "title"]
    assert "83%" in lines[1] and "survey" in lines[2] and "never" in lines[3]

    a.write_text(a.read_text("utf-8").replace("four", "FOUR"), "utf-8")
    _, out, _ = run(capsys, "list", "--json")
    assert json.loads(out)[0]["note"] == "source changed"
    a.write_text(tiny("Alpha"), "utf-8")
    _, out, _ = run(capsys, "list", "--json")
    assert json.loads(out)[0]["note"] is None
    shutil.rmtree(a.parent)
    _, out, _ = run(capsys, "list", "--json")
    assert json.loads(out)[0]["note"] is None
    assert run(capsys, "status")[0] == 0


def test_list_notices_a_changed_image(lib, capsys):
    make_library(capsys, lib)
    src = calc(lib)
    assert reg_json(capsys, str(src))[0] == 0
    img = src.parent / "assets" / "cubic.png"
    img.write_bytes(img.read_bytes() + b"x")
    _, out, _ = run(capsys, "list", "--json")
    assert json.loads(out)[0]["note"] == "source changed"
    img.unlink()
    _, out, _ = run(capsys, "list", "--json")
    assert json.loads(out)[0]["note"] == "source changed (has errors)"


def snapshot_paths(library):
    (e,) = store.load(library)["quiz"]
    vdir = library / "quizzes" / e["id"] / "versions"
    return e, vdir / f"{e['current']}.md", next((library / "assets").iterdir())


def test_status_catches_edited_snapshots_and_assets(lib, capsys):
    library = make_library(capsys, lib)
    assert reg_json(capsys, str(calc(lib)))[0] == 0
    code, out, _ = run(capsys, "status", "--json")
    data = json.loads(out)
    assert code == 0 and "assets" not in data
    assert data["counts"]["assets"] == 1 and data["counts"]["unused_assets"] == 0
    assert data["counts"]["versions"] == 1
    assert "assets: 1" in run(capsys, "status")[1]

    _e, md, asset = snapshot_paths(library)
    make_writable(md)
    original = md.read_bytes()
    md.write_bytes(original + b" ")
    code, out, _ = run(capsys, "status", "--json")
    assert code == 1
    assert any("does not match its hash" in p for p in json.loads(out)["problems"])
    md.write_bytes(original)
    assert run(capsys, "status")[0] == 0

    make_writable(asset)
    asset.write_bytes(b"changed")
    code, out, _ = run(capsys, "status", "--json")
    assert code == 1
    assert any(asset.name in p for p in json.loads(out)["problems"])

    asset.unlink()
    code, out, _ = run(capsys, "status", "--json")
    assert code == 1
    assert any("missing from assets/" in p for p in json.loads(out)["problems"])


def test_status_reports_stray_and_missing_version_files_and_unused_assets(lib, capsys):
    library = make_library(capsys, lib)
    assert reg_json(capsys, str(calc(lib)))[0] == 0
    _e, md, _ = snapshot_paths(library)
    extra = library / "assets" / (hashlib.sha256(b"extra").hexdigest() + ".png")
    extra.write_bytes(b"extra")
    code, out, _ = run(capsys, "status", "--json")
    data = json.loads(out)
    assert code == 0 and data["problems"] == []
    assert data["counts"]["assets"] == 2 and data["counts"]["unused_assets"] == 1
    assert "1 unused assets" in data["info"][0]
    assert "info: 1 unused assets" in run(capsys, "status")[1]

    stray = md.parent / "deadbeefdeadbeef.md"
    stray.write_text("x", encoding="utf-8")
    code, out, _ = run(capsys, "status", "--json")
    assert code == 1
    problems = json.loads(out)["problems"]
    assert any("deadbeefdeadbeef.md has no entry" in p for p in problems)
    stray.unlink()

    toml = md.with_name(md.stem + ".assets.toml")
    make_writable(toml)
    toml.unlink()
    code, out, _ = run(capsys, "status", "--json")
    assert code == 1
    problems = json.loads(out)["problems"]
    assert any("missing" in p and "assets.toml" in p for p in problems)


def test_status_reports_an_unreadable_results_file(lib, capsys):
    library = make_library(capsys, lib)
    assert reg_json(capsys, str(write_md(lib / "a", tiny())))[0] == 0
    e = entry_of(library)
    folder = library / "quizzes" / e["id"] / "results"
    folder.mkdir()
    (folder / "20261022-101500.json").write_text("{not json", encoding="utf-8")
    assert quizzes.attempts_for(library, e["id"], e["current"]) == 0
    code, out, _ = run(capsys, "status", "--json")
    assert code == 1
    problems = json.loads(out)["problems"]
    assert any("not a readable results file" in p for p in problems)


# ------------------------------------------------------------------ take


class RunningTake(Running):
    """`quiz library take` in a thread that the test always stops."""

    def __init__(self, name, **kw):
        self.args = Namespace(
            **{
                "name": name,
                "no_open": True,
                "timeout": 30,
                "port": 0,
                "json": False,
                **kw,
            }
        )
        self.stop = threading.Event()
        self.urls: list[str] = []
        self.code: int | None = None
        self.thread = threading.Thread(target=self._run)

    def _run(self):
        self.code = commands.take(self.args, self.stop.is_set, self.urls.append)


def calc_quiz(src):
    quiz, findings, _ = load_quiz(src)
    assert quiz is not None and not findings.has_errors
    return quiz


def calc_results(quiz):
    first = quiz.questions[0]
    responses = {first.id: correct_response(first, quiz)}
    return make_results(quiz, responses, source_file="quiz.md")


def result_files(library, name=None):
    entry = entry_of(library, name)
    folder = library / "quizzes" / entry["id"] / "results"
    return sorted(folder.glob("*.json")) if folder.is_dir() else []


@needs_git
def test_take_files_the_result_commits_and_list_shows_it(lib, capsys):
    library = make_library(capsys, lib)
    src = calc(lib)
    quiz = calc_quiz(src)
    assert reg_json(capsys, str(src), "-n", "calc")[0] == 0
    shutil.rmtree(src.parent)
    entry = entry_of(library, "calc")
    folder = library / "quizzes" / entry["id"]
    before = commit_count(library)
    with RunningTake("calc") as t:
        cfg = injected(t.page())
        assert cfg["autosave"] == "/progress" and cfg["progress"] is None
        assert "data:image" in t.page()  # the images came from the library
        assert t.post_progress(progress_body(quiz))[0] == 200
        assert (folder / "progress.json").is_file()
        code, body = t.post(calc_results(quiz))
        assert code == 200 and body["ok"]
        assert t.finish() == 0
    (saved,) = result_files(library, "calc")
    validate_results(json.loads(saved.read_text(encoding="utf-8")))
    assert not (folder / "progress.json").exists()
    out = capsys.readouterr().out
    assert f"saved quizzes/{entry['id']}/results/{saved.name}" in out
    assert re.search(r"^score: \d+(\.\d+)?/\d+(\.\d+)? \(\d+%\)", out, re.MULTILINE)
    assert commit_count(library) == before + 1
    subject = git_out(library, "log", "-1", "--format=%s")
    assert re.fullmatch(r"take: calc \(\d+%, [0-9a-f]{7}\)", subject)
    assert git_out(library, "status", "--porcelain") == ""
    _, out, _ = run(capsys, "list", "--json")
    (row,) = json.loads(out)
    assert row["attempts"] == 1 and isinstance(row["last_score"], (int, float))


@needs_git
def test_take_of_a_survey_says_answers_saved(lib, capsys):
    library = make_library(capsys, lib)
    src = write_md(
        lib / "s", (FIX / "survey.md").read_text(encoding="utf-8"), "survey.md"
    )
    quiz = calc_quiz(src)
    assert reg_json(capsys, str(src), "-n", "poll")[0] == 0
    with RunningTake("poll") as t:
        data = make_results(quiz, SURVEY_RESPONSES, source_file="survey.md")
        data["attempt"]["mode"] = "survey"
        assert t.post(data)[0] == 200
        assert t.finish() == 0
    out = capsys.readouterr().out
    assert "answers saved (survey)" in out and "score:" not in out
    subject = git_out(library, "log", "-1", "--format=%s")
    assert re.fullmatch(r"take: poll \(survey, [0-9a-f]{7}\)", subject)
    _, out, _ = run(capsys, "list", "--json")
    assert json.loads(out)[0]["last_score"] is None


@needs_git
def test_take_without_a_submit_keeps_progress_then_resumes(lib, capsys):
    library = make_library(capsys, lib)
    src = calc(lib)
    quiz = calc_quiz(src)
    assert reg_json(capsys, str(src), "-n", "calc")[0] == 0
    folder = library / "quizzes" / entry_of(library, "calc")["id"]
    before = commit_count(library)
    capsys.readouterr()
    with RunningTake("calc") as t:
        assert t.post_progress(progress_body(quiz))[0] == 200
        t.stop.set()
        assert t.finish() == 2
    out = capsys.readouterr().out
    assert "progress saved; run quiz library take calc to resume" in out
    assert (folder / "progress.json").is_file()
    assert result_files(library, "calc") == []
    assert commit_count(library) == before

    with RunningTake("calc", json=True) as t:
        progress = injected(t.page())["progress"]
        assert progress is not None and progress["started"] is True
        t.stop.set()
        assert t.finish() == 2
    cap = capsys.readouterr()
    outcome = json.loads(cap.out)
    assert outcome["status"] == "timeout" and outcome["resume"] is True
    assert outcome["results"] is None and outcome["score"] is None
    assert outcome["committed"] is False and outcome["name"] == "calc"
    assert commit_count(library) == before


@needs_git
def test_take_json_reports_the_submit(lib, capsys):
    library = make_library(capsys, lib)
    src = calc(lib)
    quiz = calc_quiz(src)
    assert reg_json(capsys, str(src), "-n", "calc")[0] == 0
    capsys.readouterr()
    with RunningTake("calc", json=True) as t:
        assert t.post(calc_results(quiz))[0] == 200
        assert t.finish() == 0
    cap = capsys.readouterr()
    outcome = json.loads(cap.out)
    assert outcome["status"] == "submitted" and outcome["committed"] is True
    assert outcome["resume"] is False and outcome["mode"] == "quiz"
    assert outcome["hash"] == entry_of(library, "calc")["current"]
    assert set(outcome["score"]) == {
        "earned",
        "possible_auto",
        "percent_auto",
        "pending_points",
    }
    assert Path(outcome["results"]) == result_files(library, "calc")[0].resolve()
    assert "serving http://127.0.0.1" in cap.err  # info lines moved to stderr
    assert "saved quizzes/" in cap.err


@needs_git
def test_take_with_a_changed_source_serves_the_registered_version(lib, capsys):
    library = make_library(capsys, lib)
    src = calc(lib)
    assert reg_json(capsys, str(src), "-n", "calc")[0] == 0
    current = entry_of(library, "calc")["current"]
    src.write_text(src.read_text("utf-8") + "\n<!-- edited -->\n", "utf-8")
    capsys.readouterr()
    with RunningTake("calc") as t:
        meta = quiz_meta_of_html(t.page())
        assert meta is not None and meta["hash"] == current
        t.stop.set()
        t.finish()
    err = capsys.readouterr().err
    assert "calc: the source changed since it was registered" in err
    assert "taking the registered version" in err
    assert "quiz library register" in err and "--update calc" in err
    assert entry_of(library, "calc")["current"] == current
    assert len(entry_of(library, "calc")["versions"]) == 1

    with RunningTake("calc", json=True) as t:
        t.stop.set()
        t.finish()
    outcome = json.loads(capsys.readouterr().out)
    assert any("source changed" in w for w in outcome["warnings"])


def test_take_errors(lib, capsys):
    code, _, err = run(capsys, "take", "calc", "--no-open")
    assert code == 2 and "No library on this machine" in err
    library = make_library(capsys, lib)
    code, _, err = run(capsys, "take", "nothing", "--no-open")
    assert code == 2 and "no quiz named" in err
    assert reg_json(capsys, str(calc(lib)), "-n", "calc")[0] == 0
    entry = entry_of(library, "calc")
    snap = library / "quizzes" / entry["id"] / "versions" / f"{entry['current']}.md"
    make_writable(snap)
    snap.write_text(snap.read_text("utf-8") + "\nchanged\n", "utf-8")
    code, _, err = run(capsys, "take", "calc", "--no-open")
    assert code == 1 and "quiz library status" in err


def test_take_on_a_port_in_use_exits_2(lib, capsys):
    make_library(capsys, lib)
    assert reg_json(capsys, str(calc(lib)), "-n", "calc")[0] == 0
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        s.listen()
        port = s.getsockname()[1]
        code, _, err = run(capsys, "take", "calc", "--no-open", "--port", str(port))
    assert code == 2 and f"cannot listen on 127.0.0.1:{port}" in err


# ------------------------------------------------------------------ share


def strip_built_at(html):
    return re.sub(r'"built_at":\s*"[^"]*"', '"built_at": ""', html)


def share(capsys, *argv):
    code, out, err = run(capsys, "share", *argv)
    return code, out.strip(), err


def test_share_writes_the_clean_page_and_never_overwrites(lib, capsys):
    make_library(capsys, lib)
    src = calc(lib)
    built = lib / "built.html"
    assert main(["build", str(src), "-o", str(built)]) == 0
    capsys.readouterr()
    assert reg_json(capsys, str(src), "-n", "calc")[0] == 0
    shutil.rmtree(src.parent)
    out_dir = lib / "out"
    code, out, _ = share(capsys, "calc", "-o", str(out_dir))
    page = out_dir / "calc.html"
    assert code == 0 and Path(out) == page.resolve()
    html = page.read_text(encoding="utf-8")
    assert "<script>window.FULLMARK_SUBMIT" not in html  # quiz.js itself names it
    assert "default-src 'none';" in html and "connect-src" not in html
    assert strip_built_at(html) == strip_built_at(built.read_text(encoding="utf-8"))
    assert "data:image" in html  # the source folder is gone, the images stay
    code, out, _ = share(capsys, "calc", "-o", str(out_dir))
    assert code == 0 and Path(out) == (out_dir / "calc-2.html").resolve()
    assert page.read_text(encoding="utf-8") == html
    # nothing in the library changed
    assert git_out(lib / "library", "status", "--porcelain") == ""


def test_share_defaults_to_the_current_folder(lib, capsys):
    make_library(capsys, lib)
    assert reg_json(capsys, str(calc(lib)), "-n", "calc")[0] == 0
    code, out, _ = share(capsys, "calc")
    assert code == 0 and Path(out) == (lib / "work" / "calc.html").resolve()
    assert (lib / "work" / "calc.html").is_file()


def test_share_version_takes_a_hash_or_a_prefix(lib, capsys):
    library = make_library(capsys, lib)
    src = calc(lib)
    assert reg_json(capsys, str(src), "-n", "calc")[0] == 0
    old = entry_of(library, "calc")["current"]
    add_result(library, entry_of(library, "calc"), old)
    src.write_text(src.read_text("utf-8") + "\n<!-- v2 -->\n", "utf-8")
    code, data, _ = reg_json(capsys, str(src), "--update", "calc")
    assert code == 0 and data["status"] == "new-version"
    new = entry_of(library, "calc")["current"]
    assert new != old
    for text in (old[:4], old):
        code, out, _ = share(
            capsys, "calc", "-o", str(lib / f"v-{text}"), "--version", text
        )
        assert code == 0
        meta = quiz_meta_of_html(Path(out).read_text(encoding="utf-8"))
        assert meta is not None and meta["hash"] == old
    code, out, _ = share(capsys, "calc", "-o", str(lib / "cur"))
    meta = quiz_meta_of_html(Path(out).read_text(encoding="utf-8"))
    assert meta is not None and meta["hash"] == new
    for bad in ("zzzz", old[:3]):
        code, out, err = share(capsys, "calc", "-o", str(lib / "bad"), "--version", bad)
        assert code == 2 and out == ""
        assert old in err and new in err and "(" in err
    assert not (lib / "bad").exists()


def test_share_source_writes_an_editable_folder(lib, capsys):
    library = make_library(capsys, lib)
    src = calc(lib)
    (src.parent / "brief.yaml").write_text("request: practice\n", encoding="utf-8")
    assert reg_json(capsys, str(src), "-n", "calc")[0] == 0
    original = tree(src.parent)
    original.pop("assets/ielts-chart.png")  # not referenced, so never registered
    shutil.rmtree(src.parent)
    code, out, _ = share(capsys, "calc", "--source", "-o", str(lib / "src"))
    lines = out.splitlines()
    folder = lib / "src" / "calc"
    assert code == 0 and Path(lines[0]) == folder.resolve()
    assert lines[1].startswith("edit it, then: quiz library register ")
    assert lines[1].endswith(" --update calc")
    assert str(folder.resolve() / "quiz.md") in lines[1]
    assert tree(folder) == original
    for p in folder.rglob("*"):
        if p.is_file():
            assert os.access(p, os.W_OK)
            assert p.stat().st_mode & stat.S_IWRITE
    code, out, _ = register(capsys, str(folder / "quiz.md"), "--update", "calc")
    assert code == 0 and "unchanged calc (" in out
    code, out, _ = share(capsys, "calc", "--source", "-o", str(lib / "src"))
    assert code == 0 and Path(out.splitlines()[0]) == (lib / "src" / "calc-2").resolve()
    assert tree(lib / "src" / "calc-2") == original
    assert git_out(library, "status", "--porcelain") in ("", "?? ")


def test_share_source_keeps_the_original_file_name(lib, capsys):
    make_library(capsys, lib)
    src = write_md(lib / "n", tiny("Named"), "my-quiz.md")
    assert reg_json(capsys, str(src), "-n", "named")[0] == 0
    code, out, _ = share(capsys, "named", "--source", "-o", str(lib / "o"))
    assert code == 0
    assert (lib / "o" / "named" / "my-quiz.md").is_file()
    assert not (lib / "o" / "named" / "quiz.md").exists()
    code, out, _ = register(
        capsys, str(lib / "o" / "named" / "my-quiz.md"), "--update", "named"
    )
    assert code == 0 and out.startswith("unchanged")


def test_share_errors(lib, capsys):
    assert share(capsys, "calc")[0] == 2
    make_library(capsys, lib)
    code, _, err = share(capsys, "nothing")
    assert code == 2 and "no quiz named" in err


# ------------------------------------------------------------------ path


def test_path_prints_the_library_or_a_quiz_folder(lib, capsys):
    code, _, err = run(capsys, "path")
    assert code == 2 and "No library on this machine" in err
    library = make_library(capsys, lib)
    code, out, _ = run(capsys, "path")
    assert code == 0 and out.strip() == str(library.resolve())
    assert reg_json(capsys, str(calc(lib)), "-n", "calc")[0] == 0
    entry = entry_of(library, "calc")
    code, out, _ = run(capsys, "path", "calc")
    expected = library.resolve() / "quizzes" / entry["id"]
    assert code == 0 and out.strip() == str(expected)
    assert Path(out.strip()).is_dir()
    code, out, _ = run(capsys, "path", entry["id"])
    assert code == 0 and out.strip() == str(expected)
    code, out, err = run(capsys, "path", "nothing")
    assert code == 2 and out == "" and "no quiz named" in err


def test_commands_help_lists_take_share_and_path(capsys):
    with pytest.raises(SystemExit):
        main(["library", "--help"])
    out = capsys.readouterr().out
    for word in ("take", "share", "path"):
        assert word in out


# ------------------------------------------------------------------ terminal tables (Rich)


def rich_console():
    import io

    from rich.console import Console

    return Console(
        file=io.StringIO(),
        record=True,
        force_terminal=True,
        width=120,
        color_system="truecolor",
        legacy_windows=False,
    )


@pytest.fixture
def rich_run(monkeypatch, capsys):
    """Run a library command as in a terminal; returns (code, recorded console, stderr)."""
    from fullmark.library import pretty

    def go(*argv):
        console = rich_console()
        monkeypatch.setattr(pretty, "use_rich", lambda _args: True)
        monkeypatch.setattr(pretty, "make_console", lambda *a, **k: console)
        code = main(["library", *argv])
        cap = capsys.readouterr()
        assert cap.out == ""
        return code, console, cap.err

    return go


def fake_tty(monkeypatch, value=True):
    monkeypatch.delenv("NO_COLOR", raising=False)
    monkeypatch.delenv(
        "CLAUDECODE", raising=False
    )  # set when Claude Code runs the tests
    monkeypatch.setattr(sys.stdout, "isatty", lambda: value, raising=False)


def test_use_rich_needs_a_terminal_and_no_opt_out(monkeypatch):
    from fullmark.library import pretty

    def args(**kw):
        return Namespace(**{"json": False, "plain": False, **kw})

    fake_tty(monkeypatch)
    assert pretty.use_rich(args()) is True
    assert pretty.use_rich(args(json=True)) is False
    assert pretty.use_rich(args(plain=True)) is False
    monkeypatch.setenv("NO_COLOR", "1")
    assert pretty.use_rich(args()) is False
    monkeypatch.setenv("NO_COLOR", "")
    assert pretty.use_rich(args()) is True
    monkeypatch.setenv("CLAUDECODE", "1")
    assert pretty.use_rich(args()) is False
    monkeypatch.delenv("CLAUDECODE")
    fake_tty(monkeypatch, False)
    assert pretty.use_rich(args()) is False


def test_plain_output_in_a_pipe_has_no_escapes_or_boxes(lib, capsys):
    make_library(capsys, lib)
    assert reg_json(capsys, str(write_md(lib / "a", tiny("Alpha"))))[0] == 0
    for cmd in ("list", "status"):
        _code, out, _ = run(capsys, cmd)
        assert "\x1b[" not in out
        assert not any(ch in out for ch in "╭│╰─")


def test_plain_flag_in_a_terminal_equals_the_piped_output(lib, capsys, monkeypatch):
    make_library(capsys, lib)
    assert reg_json(capsys, str(write_md(lib / "a", tiny("Alpha"))))[0] == 0
    for cmd in ("list", "status"):
        piped = run(capsys, cmd)
        fake_tty(monkeypatch)
        forced = run(capsys, cmd, "--plain")
        assert forced == piped
        fake_tty(monkeypatch, False)


def test_list_in_a_terminal_is_a_colored_table(lib, capsys, rich_run):
    library = make_library(capsys, lib)
    a = write_md(lib / "a", tiny("Alpha"))
    b = write_md(lib / "b", tiny("Beta"))
    c = write_md(lib / "c", tiny("Gamma"))
    for src in (a, b, c):
        assert reg_json(capsys, str(src))[0] == 0
    alpha, beta = entry_of(library, "alpha"), entry_of(library, "beta")
    add_result(library, alpha, alpha["current"], percent=82.6)
    add_result(library, beta, beta["current"], percent=0, mode="survey")
    a.write_text(a.read_text("utf-8").replace("four", "FOUR"), "utf-8")
    code, console, _ = rich_run("list")
    assert code == 0
    text = console.export_text(styles=False, clear=False)
    for word in ("alpha", "beta", "gamma", "83%", "survey", "never"):
        assert word in text
    assert "⚠ source changed" in text
    assert "3 quizzes · take one with: quiz library take ID" in text
    assert entry_of(library, "alpha")["id"] in text
    assert "╭" in text and "│" in text
    colored = console.export_text(styles=True, clear=False)
    assert "\x1b[32m83%" in colored
    assert "\x1b[33m⚠ source changed" in colored
    assert "\x1b[36msurvey" in colored
    assert f"\x1b[1;35m{alpha['id']}" in colored


def test_list_in_a_terminal_when_empty_or_without_a_library(lib, capsys, rich_run):
    code, _console, err = rich_run("list")
    assert code == 2 and "quiz library init" in err
    make_library(capsys, lib)
    code, console, _ = rich_run("list")
    assert code == 0
    assert "No quizzes yet. Register one with: quiz library register FILE.md" in (
        console.export_text()
    )


@needs_git
def test_status_in_a_terminal_healthy_and_with_a_problem(lib, capsys, rich_run):
    library = make_library(capsys, lib)
    code, console, _ = rich_run("status")
    text = console.export_text(styles=False, clear=False)
    assert code == 0
    assert "⚠ 1 warning" in text
    assert "⚠ no remote: the git history is not an off-machine backup" in text
    assert "✓ own repository" in text and "0 quizzes" in text
    assert "\x1b[33m" in console.export_text(styles=True, clear=False)

    assert reg_json(capsys, str(calc(lib)))[0] == 0
    _e, md, _asset = snapshot_paths(library)
    make_writable(md)
    md.write_bytes(md.read_bytes() + b" ")
    code, console, _ = rich_run("status")
    text = console.export_text(styles=False, clear=False)
    assert code == 1
    assert "✗ 1 problem" in text and "does not match its hash" in text
    assert "\x1b[31m" in console.export_text(styles=True, clear=False)


def test_status_in_a_terminal_with_no_library(lib, rich_run):
    code, console, err = rich_run("status")
    text = console.export_text(styles=False, clear=False)
    assert code == 2
    assert "No library on this machine" in text
    assert "quiz library init PATH" in text
    assert "quiz library init [PATH]" in err


def test_the_plain_and_json_paths_do_not_import_rich(lib, capsys):
    make_library(capsys, lib)
    code = (
        "import sys; from fullmark.cli import main; "
        "c = main(['library', 'list', '--json']); "
        "print(c, 'rich' in sys.modules)"
    )
    r = subprocess.run(
        [sys.executable, "-c", code],
        capture_output=True,
        text=True,
        check=False,
    )
    assert r.stdout.split()[-2:] == ["0", "False"], r.stdout + r.stderr


# ------------------------------------------------------------------ help


def test_every_command_is_in_exactly_one_help_group(capsys):
    from fullmark.cli import COMMAND_GROUPS, build_parser

    sub = next(a for a in build_parser()._actions if a.dest == "command" and a.choices)
    choices = sub.choices
    assert choices is not None
    listed = [n for names in COMMAND_GROUPS.values() for n in names]
    assert sorted(listed) == sorted(choices)
    assert len(listed) == len(set(listed))
    with pytest.raises(SystemExit):
        main(["--help"])
    out = capsys.readouterr().out
    for name in choices:
        assert len(re.findall(rf"^  {re.escape(name)}\s", out, re.MULTILINE)) == 1
    assert out.index("Files:") < out.index("Library:")


def test_library_help_lists_its_commands_in_order(capsys):
    with pytest.raises(SystemExit):
        main(["library", "--help"])
    out = capsys.readouterr().out
    order = ["init", "status", "register", "list", "take", "share", "path"]
    positions = [out.index(f"    {n} ") for n in order]
    assert positions == sorted(positions)


# ------------------------------------------------------------------ grade and stats

GRADABLE = """---
title: Gradable
id: gr
---

## What is 2 + 2? {id=add tags=maths}

- [ ] 3
- [x] 4

> [!explanation]
> Two plus two is four, because adding two twice counts four units in all.

## Describe a city. {type=essay points=5 id=city}

```answer
min_words: 3
rubric:
  - Clear writing
```
"""
FLIPPED = GRADABLE.replace("- [ ] 3\n- [x] 4", "- [x] 3\n- [ ] 4")
RIGHT = {"add": {"choice": 1}, "city": {"text": "A big busy city.", "word_count": 4}}
WRONG = {"add": {"choice": 0}}


def gradable(lib, text=GRADABLE, folder="gr"):
    d = lib / folder
    d.mkdir(exist_ok=True)
    (d / "quiz.md").write_text(text, encoding="utf-8")
    return d / "quiz.md"


def add_attempt(library, entry, text, stem, when, responses=RIGHT, hash_=None):
    """File a results export for the quiz source `text`, as `take` would."""
    src = library.parent / "scratch-attempts" / f"{stem}.md"
    src.parent.mkdir(exist_ok=True)
    src.write_text(text, encoding="utf-8")
    quiz = calc_quiz(src)
    doc = make_results(
        quiz, responses, source_file="quiz.md", started_at=when, submitted_at=when
    )
    if hash_:
        doc["quiz"]["hash"] = hash_
    folder = library / "quizzes" / entry["id"] / "results"
    folder.mkdir(parents=True, exist_ok=True)
    (folder / f"{stem}.json").write_text(json.dumps(doc), encoding="utf-8")
    return doc


def reports_of(library, entry):
    folder = library / "quizzes" / entry["id"] / "reports"
    return sorted(p.name for p in folder.iterdir()) if folder.is_dir() else []


def graded_library(capsys, lib):
    library = make_library(capsys, lib)
    assert register(capsys, str(gradable(lib)), "-n", "gr")[0] == 0
    return library, entry_of(library, "gr")


@needs_git
def test_grade_takes_the_newest_attempt_and_writes_into_reports(lib, capsys):
    library, entry = graded_library(capsys, lib)
    add_attempt(library, entry, GRADABLE, "20261020-100000", "2026-10-20T10:00:00Z")
    add_attempt(library, entry, GRADABLE, "20261022-100000", "2026-10-22T10:00:00Z")
    before = commit_count(library)
    code, out, err = run(capsys, "grade", "gr")
    assert code == 0, err
    folder = library / "quizzes" / entry["id"]
    assert (folder / "reports" / "20261022-100000-report.md").is_file()
    assert "20261022-100000-report.md" in out
    assert reports_of(library, entry) == ["20261022-100000-report.md"]
    assert commit_count(library) == before + 1
    assert git_out(library, "log", "-1", "--format=%s") == "grade: gr 20261022-100000"
    assert git_out(library, "status", "--porcelain") == ""
    assert not list((folder / "results").glob("*report*"))


@needs_git
def test_grade_attempt_by_stem_prefix_ambiguous_and_unknown(lib, capsys):
    library, entry = graded_library(capsys, lib)
    add_attempt(library, entry, GRADABLE, "20261020-100000", "2026-10-20T10:00:00Z")
    add_attempt(library, entry, GRADABLE, "20261022-100000", "2026-10-22T10:00:00Z")
    add_attempt(library, entry, GRADABLE, "20261022-110000", "2026-10-22T11:00:00Z")
    code, out, _ = run(capsys, "grade", "gr", "--attempt", "20261020")
    assert code == 0 and "20261020-100000-report.md" in out
    code, _, err = run(capsys, "grade", "gr", "--attempt", "202610")
    assert code == 2 and "more than one" in err and "20261022-110000" in err
    code, _, err = run(capsys, "grade", "gr", "--attempt", "20270101")
    assert code == 2 and "is not an attempt" in err
    code, _, err = run(capsys, "grade", "gr", "--attempt", "202")
    assert code == 2 and "is not an attempt" in err
    assert reports_of(library, entry) == ["20261020-100000-report.md"]


@needs_git
def test_grade_and_stats_without_attempts_exit_2(lib, capsys):
    graded_library(capsys, lib)
    for cmd in ("grade", "stats"):
        code, _, err = run(capsys, cmd, "gr")
        assert code == 2
        assert "gr has no attempts yet; take it with quiz library take gr" in err
        assert f"quiz library {cmd}:" in err


@needs_git
def test_grade_uses_the_version_the_attempt_was_taken_on(lib, capsys):
    library, entry = graded_library(capsys, lib)
    old_hash = entry["current"]
    add_attempt(library, entry, GRADABLE, "20261020-100000", "2026-10-20T10:00:00Z")
    code, out, _ = reg_json(capsys, str(gradable(lib, FLIPPED)), "--update", "gr")
    assert out["status"] == "new-version"
    code, _, err = run(capsys, "grade", "gr", "--json")
    assert code == 0, err
    entry = entry_of(library, "gr")
    assert entry["current"] != old_hash
    path = library / "quizzes" / entry["id"] / "reports" / "20261020-100000-report.json"
    report = json.loads(path.read_text(encoding="utf-8"))
    by_id = {q["id"]: q for q in report["questions"]}
    assert by_id["add"]["status"] == "correct"  # the old answer key, not the new one
    assert not any("changed after the attempt" in w for w in report["warnings"])


@needs_git
def test_grade_with_a_missing_version_warns_and_still_reports(lib, capsys):
    library, entry = graded_library(capsys, lib)
    add_attempt(
        library,
        entry,
        GRADABLE,
        "20261020-100000",
        "2026-10-20T10:00:00Z",
        hash_="deadbeefdeadbeef",
    )
    code, _out, err = run(capsys, "grade", "gr")
    assert code == 0
    assert "deadbeefdeadbeef is not in the library" in err
    assert reports_of(library, entry) == ["20261020-100000-report.md"]
    report = library / "quizzes" / entry["id"] / "reports" / "20261020-100000-report.md"
    assert "no quiz source found" in report.read_text(encoding="utf-8")


@needs_git
def test_grade_json_writes_the_grades_template_and_the_round_trip(lib, capsys):
    library, entry = graded_library(capsys, lib)
    add_attempt(library, entry, GRADABLE, "20261020-100000", "2026-10-20T10:00:00Z")
    code, out, _ = run(capsys, "grade", "gr", "--json")
    assert code == 0
    folder = library / "quizzes" / entry["id"] / "reports"
    tpl = folder / "20261020-100000-grades.json"
    assert tpl.is_file() and "20261020-100000-grades.json" in out
    assert reports_of(library, entry) == [
        "20261020-100000-grades.json",
        "20261020-100000-report.json",
    ]
    grades = json.loads(tpl.read_text(encoding="utf-8"))
    (item,) = (
        grades["grades"].values()
        if isinstance(grades["grades"], dict)
        else grades["grades"]
    )
    item.update(score=4, justification="Clear.", improvement="Add detail.")
    tpl.write_text(json.dumps(grades), encoding="utf-8")
    before = commit_count(library)
    code, out, err = run(capsys, "grade", "gr", "--grades", str(tpl), "--json")
    assert code == 0, err
    report = json.loads((folder / "20261020-100000-report.json").read_text("utf-8"))
    assert report["summary"]["final_earned"] == 5  # 1 auto + 4 graded
    assert commit_count(library) == before + 1
    # a grades file with a score out of range exits 1 and commits nothing
    item.update(score=40)
    bad = folder.parent / "bad-grades.json"
    bad.write_text(json.dumps(grades), encoding="utf-8")
    before = commit_count(library)
    code, _, err = run(capsys, "grade", "gr", "--grades", str(bad), "--json")
    assert code == 1 and "quiz library grade" in err
    bad.unlink()
    assert commit_count(library) == before


@needs_git
def test_reports_do_not_change_list_or_status(lib, capsys):
    library, entry = graded_library(capsys, lib)
    add_attempt(library, entry, GRADABLE, "20261020-100000", "2026-10-20T10:00:00Z")
    assert run(capsys, "grade", "gr", "--json")[0] == 0
    _, out, _ = run(capsys, "list", "--json")
    (row,) = json.loads(out)
    assert row["attempts"] == 1
    code, out, _ = run(capsys, "status", "--json")
    report = json.loads(out)
    assert code == 0 and report["status"] == "ok"
    assert report["counts"]["attempts"] == 1
    assert report["problems"] == []


@needs_git
def test_stats_over_one_version_uses_the_quiz(lib, capsys):
    library, entry = graded_library(capsys, lib)
    add_attempt(
        library, entry, GRADABLE, "20261020-100000", "2026-10-20T10:00:00Z", WRONG
    )
    add_attempt(library, entry, GRADABLE, "20261022-100000", "2026-10-22T10:00:00Z")
    code, out, err = run(capsys, "stats", "gr", "--json")
    assert code == 0, err
    data = json.loads(out)
    assert len(data["attempts"]) == 2
    assert data["warnings"] == []
    before = commit_count(library)
    code, out, _ = run(capsys, "stats", "gr")
    assert code == 0 and out.startswith("# Progress: gr")
    assert commit_count(library) == before  # stats writes nothing


@needs_git
def test_stats_over_mixed_versions_keeps_each_attempts_own_grades(
    lib, capsys, monkeypatch
):
    library, entry = graded_library(capsys, lib)
    add_attempt(library, entry, GRADABLE, "20261020-100000", "2026-10-20T10:00:00Z")
    assert reg_json(capsys, str(gradable(lib, FLIPPED)), "--update", "gr")[0] == 0
    add_attempt(
        library, entry, FLIPPED, "20261022-100000", "2026-10-22T10:00:00Z", WRONG
    )
    seen = {}
    real = commands.collect_stats

    def spy(paths, quiz):
        seen["quiz"] = quiz
        return real(paths, quiz)

    monkeypatch.setattr(commands, "collect_stats", spy)
    code, out, err = run(capsys, "stats", "gr", "--json")
    assert code == 0, err
    assert seen["quiz"] is None
    warning = "attempts span 2 versions; using the grades each attempt was made with"
    assert warning in json.loads(out)["warnings"]


@needs_git
def test_stats_errors_when_the_quiz_id_changed_between_versions(lib, capsys):
    library, entry = graded_library(capsys, lib)
    add_attempt(library, entry, GRADABLE, "20261020-100000", "2026-10-20T10:00:00Z")
    add_attempt(
        library,
        entry,
        GRADABLE.replace("id: gr", "id: other"),
        "20261022-100000",
        "2026-10-22T10:00:00Z",
    )
    code, _, err = run(capsys, "stats", "gr")
    assert code == 2 and "quiz library stats:" in err and "different quizzes" in err


# ------------------------------------------------------------------ rename and rm


def two_quizzes(capsys, lib):
    library = make_library(capsys, lib)
    assert register(capsys, str(gradable(lib)), "-n", "gr")[0] == 0
    other = gradable(lib, GRADABLE.replace("Gradable", "Other"), folder="other")
    assert register(capsys, str(other), "-n", "other")[0] == 0
    return library


@needs_git
def test_rename_changes_the_name_commits_and_lookup_follows(lib, capsys):
    library = two_quizzes(capsys, lib)
    qid = entry_of(library, "gr")["id"]
    before = commit_count(library)
    code, out, _ = run(capsys, "rename", "gr", "algebra")
    assert code == 0 and "renamed gr to algebra" in out
    assert entry_of(library, "algebra")["id"] == qid
    assert (library / "quizzes" / qid).is_dir()
    assert commit_count(library) == before + 1
    assert git_out(library, "log", "-1", "--format=%s") == "rename: gr -> algebra"
    assert run(capsys, "path", "algebra")[0] == 0
    code, _, err = run(capsys, "path", "gr")
    assert code == 2 and "no quiz named" in err
    assert run(capsys, "rename", qid, "algebra-2")[0] == 0  # by id


@needs_git
def test_rename_json_and_nothing_to_do(lib, capsys):
    library = two_quizzes(capsys, lib)
    code, out, _ = run(capsys, "rename", "gr", "algebra", "--json")
    data = json.loads(out)
    assert code == 0 and data["status"] == "renamed"
    assert (data["old"], data["new"], data["committed"]) == ("gr", "algebra", True)
    assert data["warnings"] == [] and data["id"] == entry_of(library, "algebra")["id"]
    before = commit_count(library)
    code, out, _ = run(capsys, "rename", "algebra", "algebra")
    assert code == 0 and "nothing to do" in out
    assert commit_count(library) == before


@needs_git
def test_rename_refuses_bad_taken_and_id_names(lib, capsys):
    library = two_quizzes(capsys, lib)
    before = commit_count(library)
    other_id = entry_of(library, "other")["id"]
    code, _, err = run(capsys, "rename", "gr", "Bad Name")
    assert code == 2 and quizzes.NAME_RULE in err
    code, _, err = run(capsys, "rename", "gr", "other")
    assert code == 2 and "already" in err
    code, _, err = run(capsys, "rename", "gr", other_id)
    assert code == 2 and "already" in err
    code, _, err = run(capsys, "rename", "nope", "x")
    assert code == 2
    assert entry_of(library, "gr") and commit_count(library) == before


def add_two_attempts(library, entry):
    add_attempt(library, entry, GRADABLE, "20261020-100000", "2026-10-20T10:00:00Z")
    add_attempt(library, entry, GRADABLE, "20261022-100000", "2026-10-22T10:00:00Z")


def commit_all(library, msg="test"):
    git_out(library, "add", "-A")
    git_out(library, "commit", "-q", "-m", msg)


@needs_git
def test_rm_yes_deletes_commits_and_revert_brings_it_back(lib, capsys):
    library = two_quizzes(capsys, lib)
    entry = entry_of(library, "gr")
    add_two_attempts(library, entry)
    commit_all(library)
    folder = library / "quizzes" / entry["id"]
    assert any(p.stat().st_mode & stat.S_IWRITE == 0 for p in folder.rglob("*.md"))
    before = commit_count(library)
    code, out, _ = run(capsys, "rm", "gr", "--yes")
    assert code == 0 and "deleted gr; recover it with git -C" in out
    assert "revert HEAD" in out
    assert not folder.exists()
    assert [q["name"] for q in store.load(library)["quiz"]] == ["other"]
    assert commit_count(library) == before + 1
    assert git_out(library, "log", "-1", "--format=%s") == f"rm: gr ({entry['id']})"
    code, out, _ = run(capsys, "status", "--json")
    assert code == 0 and json.loads(out)["problems"] == []
    git_out(library, "revert", "--no-edit", "HEAD")
    assert folder.is_dir() and len(list((folder / "results").glob("*.json"))) == 2
    assert {q["name"] for q in store.load(library)["quiz"]} == {"gr", "other"}
    assert run(capsys, "status", "--json")[0] == 0


@needs_git
def test_rm_the_last_quiz_leaves_a_valid_library(lib, capsys):
    library = make_library(capsys, lib)
    assert register(capsys, str(gradable(lib)), "-n", "gr")[0] == 0
    assert run(capsys, "rm", "gr", "--yes")[0] == 0
    assert store.load(library).get("quiz", []) == []
    assert run(capsys, "status", "--json")[0] == 0
    assert run(capsys, "list", "--json")[1].strip() == "[]"


def test_rm_without_a_repository_is_refused_until_forced(lib, capsys):
    path = lib / "library"
    assert run(capsys, "init", str(path), "--no-git")[0] == 0
    assert register(capsys, str(gradable(lib)), "-n", "gr")[0] == 0
    code, _, err = run(capsys, "rm", "gr", "--yes")
    assert code == 2 and "not its own git repository" in err and "--force" in err
    assert entry_of(path, "gr")
    code, out, _ = run(capsys, "rm", "gr", "--yes", "--force")
    assert code == 0 and out.strip() == "deleted gr"
    assert store.load(path).get("quiz", []) == []


@needs_git
def test_rm_refuses_a_folder_with_uncommitted_changes(lib, capsys):
    library, entry = graded_library(capsys, lib)
    add_attempt(library, entry, GRADABLE, "20261020-100000", "2026-10-20T10:00:00Z")
    code, _, err = run(capsys, "rm", "gr", "--yes")
    assert code == 2 and "has uncommitted changes" in err
    assert (library / "quizzes" / entry["id"]).is_dir()
    assert entry_of(library, "gr")
    code, _, _ = run(capsys, "rm", "gr", "--yes", "--force")
    assert code == 0 and not (library / "quizzes" / entry["id"]).exists()


@needs_git
def test_rm_without_yes_needs_a_terminal_and_json_needs_yes(lib, capsys, monkeypatch):
    library, entry = graded_library(capsys, lib)
    monkeypatch.setattr(sys.stdin, "isatty", lambda: False)
    code, _, err = run(capsys, "rm", "gr")
    assert code == 2 and "pass --yes to confirm" in err
    monkeypatch.setattr(sys.stdin, "isatty", lambda: True)
    code, out, _ = run(capsys, "rm", "gr", "--json")
    data = json.loads(out)
    assert code == 2 and data["status"] == "refused"
    assert data["reason"] == "pass --yes to confirm"
    assert (library / "quizzes" / entry["id"]).is_dir() and entry_of(library, "gr")


@needs_git
def test_rm_prompt_answered_no_cancels_and_yes_deletes(lib, capsys, monkeypatch):
    library, entry = graded_library(capsys, lib)
    add_attempt(library, entry, GRADABLE, "20261020-100000", "2026-10-20T10:00:00Z")
    commit_all(library)
    asked = []
    monkeypatch.setattr(sys.stdin, "isatty", lambda: True)

    def answer(text):
        asked.append(text)
        return reply[0]

    reply = ["n"]
    monkeypatch.setattr("builtins.input", answer)
    code, _, err = run(capsys, "rm", "gr")
    assert code == 1 and "nothing deleted" in err
    assert asked == [f"Delete gr ({entry['id']}): 1 versions, 1 attempts? [y/N] "]
    assert (library / "quizzes" / entry["id"]).is_dir() and entry_of(library, "gr")
    reply[0] = "yes"
    code, out, _ = run(capsys, "rm", "gr")
    assert code == 0 and "deleted gr" in out
    assert not (library / "quizzes" / entry["id"]).exists()


@needs_git
def test_rm_prompt_with_no_input_refuses(lib, capsys, monkeypatch):
    library, entry = graded_library(capsys, lib)
    monkeypatch.setattr(sys.stdin, "isatty", lambda: True)

    def eof(_prompt):
        raise EOFError

    monkeypatch.setattr("builtins.input", eof)
    code, _, err = run(capsys, "rm", "gr")
    assert code == 2 and "pass --yes to confirm" in err
    assert (library / "quizzes" / entry["id"]).is_dir()
