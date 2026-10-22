"""Imports go one way: the library imports core, and core never imports the library."""

import ast
import subprocess
import sys
from pathlib import Path

import pytest

SRC = Path(__file__).parent.parent / "src" / "fullmark"


def _is_library(name: str) -> bool:
    return name == "library" or name.startswith("library.")


def library_imports(tree: ast.AST) -> list[ast.AST]:
    """Import nodes (anywhere in the tree) that bring in fullmark.library."""
    found = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            hit = any(
                a.name.startswith("fullmark.")
                and _is_library(a.name[len("fullmark.") :])
                for a in node.names
            )
        elif isinstance(node, ast.ImportFrom):
            mod = node.module or ""
            names = [a.name for a in node.names]
            if node.level == 0 and mod == "fullmark":
                hit = "library" in names
            elif node.level == 0 and mod.startswith("fullmark."):
                hit = _is_library(mod[len("fullmark.") :])
            elif node.level == 1 and mod:
                hit = _is_library(mod)
            elif node.level == 1:
                hit = "library" in names
            else:
                hit = False
        else:
            hit = False
        if hit:
            found.append(node)
    return found


def core_files() -> list[Path]:
    return [
        p
        for p in sorted(SRC.rglob("*.py"))
        if "library" not in p.relative_to(SRC).parts[:1] and p.name != "cli.py"
    ]


@pytest.mark.parametrize(
    "path", core_files(), ids=lambda p: p.relative_to(SRC).as_posix()
)
def test_core_modules_never_import_the_library(path):
    tree = ast.parse(path.read_text(encoding="utf-8"))
    assert library_imports(tree) == []


def test_cli_imports_the_library_only_inside_a_function():
    tree = ast.parse((SRC / "cli.py").read_text(encoding="utf-8"))
    module_level = [
        n for n in tree.body if library_imports(ast.Module(body=[n], type_ignores=[]))
    ]
    # Only function bodies may hold the import: a top-level def is fine, a top-level
    # import (or an import in a module-level if/try/with) is not.
    offending = [
        n
        for n in module_level
        if not isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef))
    ]
    assert offending == []
    assert library_imports(tree), "cli.py should reach the library somewhere"


def test_the_layering_check_sees_every_import_form():
    for text in (
        "import fullmark.library",
        "import fullmark.library.store",
        "from fullmark.library import store",
        "from fullmark.library.store import load",
        "from .library import store",
        "from .library.store import load",
        "from . import library",
        "from fullmark import library",
    ):
        assert library_imports(ast.parse(text)), text
    for text in (
        "from . import libraryish",
        "import fullmark.checking",
        "import library",
    ):
        assert library_imports(ast.parse(text)) == [], text


def test_importing_the_cli_does_not_import_the_library():
    code = (
        "import sys, fullmark.cli; "
        "sys.exit(1 if any(m.startswith('fullmark.library') for m in sys.modules) else 0)"
    )
    assert subprocess.run([sys.executable, "-c", code], check=False).returncode == 0


def test_checking_is_core_and_does_not_import_the_library():
    code = (
        "import sys, fullmark.checking; "
        "sys.exit(1 if any(m.startswith('fullmark.library') for m in sys.modules) else 0)"
    )
    assert subprocess.run([sys.executable, "-c", code], check=False).returncode == 0
