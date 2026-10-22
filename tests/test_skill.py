"""The Claude skill in skill/SKILL.md must only mention commands and flags the CLI has."""

import re
from pathlib import Path

from fullmark.cli import build_parser

SKILL = Path(__file__).parents[1] / "skill" / "SKILL.md"


def subcommands():
    parser = build_parser()
    action = next(
        a for a in parser._actions if a.choices and isinstance(a.choices, dict)
    )
    return action.choices


def test_skill_has_front_matter():
    text = SKILL.read_text(encoding="utf-8")
    assert text.startswith("---\nname: quiz\ndescription: ")


def nested(parser):
    """The subcommands of a parser that has them (quiz library ...), else None."""
    for a in parser._actions:
        if a.choices and isinstance(a.choices, dict):
            return a.choices
    return None


def test_skill_mentions_only_real_commands_and_flags():
    text = SKILL.read_text(encoding="utf-8")
    commands = subcommands()
    for cmd, rest in re.findall(r"`quiz ([a-z-]+)([^`]*)`", text):
        assert cmd in commands, f"skill mentions unknown command: quiz {cmd}"
        parser, label = commands[cmd], cmd
        inner = nested(parser)
        if inner is not None:  # `quiz library register ...`: check the subcommand
            m = re.match(r"\s+([a-z-]+)", rest)
            if m:
                sub = m.group(1)
                assert sub in inner, f"skill mentions unknown command: quiz {cmd} {sub}"
                parser, label, rest = inner[sub], f"{cmd} {sub}", rest[m.end() :]
        known = {s for a in parser._actions for s in a.option_strings}
        for flag in re.findall(r"(?<![\w-])(--?[a-z][a-z-]*)", rest):
            assert flag in known, f"skill mentions unknown flag: quiz {label} {flag}"


def test_skill_names_every_template():
    from fullmark.templates_cmd import TEMPLATES

    text = SKILL.read_text(encoding="utf-8")
    for name in TEMPLATES:
        assert f"`{name}`" in text, f"template {name} is missing from the skill"
