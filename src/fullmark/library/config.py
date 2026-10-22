"""The machine-wide config: which library this machine uses."""

from __future__ import annotations

import os
import sys
import tomllib
from pathlib import Path

import tomli_w

from .fsutil import atomic_write_text


class ConfigError(Exception):
    """The config file exists but cannot be read."""


def config_path() -> Path:
    """Where the config lives. Decided at call time, so tests can patch the environment."""
    explicit = os.environ.get("FULLMARK_CONFIG")
    if explicit:
        return Path(explicit)
    xdg = os.environ.get("XDG_CONFIG_HOME")
    if xdg:
        return Path(xdg) / "fullmark" / "config.toml"
    if sys.platform == "win32":
        appdata = os.environ.get("APPDATA")
        base = Path(appdata) if appdata else Path.home() / "AppData" / "Roaming"
        return base / "fullmark" / "config.toml"
    if sys.platform == "darwin":
        return (
            Path.home() / "Library" / "Application Support" / "fullmark" / "config.toml"
        )
    return Path.home() / ".config" / "fullmark" / "config.toml"


def load_config() -> dict:
    path = config_path()
    try:
        text = path.read_text(encoding="utf-8")
    except FileNotFoundError:
        return {}
    except (OSError, UnicodeDecodeError) as exc:
        raise ConfigError(f"cannot read {path}: {exc}") from exc
    try:
        return tomllib.loads(text)
    except tomllib.TOMLDecodeError as exc:
        raise ConfigError(f"{path} is not valid TOML: {exc}") from exc


def save_config(data: dict) -> None:
    """Write the whole config. Callers load it, change what they need and save it back,
    so unknown keys survive."""
    path = config_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    atomic_write_text(path, tomli_w.dumps(data))


def configured_library() -> str | None:
    """`library.path` from the config file, ignoring the environment."""
    lib = load_config().get("library")
    if isinstance(lib, dict):
        value = lib.get("path")
        if isinstance(value, str) and value:
            return value
    return None


def library_location() -> tuple[Path | None, str]:
    """The library this machine uses and where that came from."""
    env = os.environ.get("FULLMARK_LIBRARY")
    if env:
        return Path(env), "FULLMARK_LIBRARY"
    configured = configured_library()
    if configured:
        return Path(configured), "config"
    return None, "none"


def as_config_path(path: Path) -> str:
    """The form stored in the config: absolute, forward slashes."""
    return Path(path).resolve().as_posix()
