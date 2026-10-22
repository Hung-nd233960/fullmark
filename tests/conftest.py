import pytest


@pytest.fixture
def lib(monkeypatch, tmp_path):
    """An isolated config, git config and working folder."""
    monkeypatch.setenv("FULLMARK_CONFIG", str(tmp_path / "cfg" / "config.toml"))
    monkeypatch.delenv("FULLMARK_LIBRARY", raising=False)
    monkeypatch.delenv("XDG_CONFIG_HOME", raising=False)
    gitconfig = tmp_path / "gitconfig"
    gitconfig.write_text("[user]\n\tname = Test\n\temail = test@example.com\n")
    monkeypatch.setenv("GIT_CONFIG_GLOBAL", str(gitconfig))
    monkeypatch.setenv("GIT_CONFIG_NOSYSTEM", "1")
    work = tmp_path / "work"
    work.mkdir()
    monkeypatch.chdir(work)
    return tmp_path
