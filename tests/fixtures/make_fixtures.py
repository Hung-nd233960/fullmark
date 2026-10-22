"""Regenerate binary fixtures and the invalid/*.md files.

Run: uv run python tests/fixtures/make_fixtures.py
"""

import json
import math
import struct
import wave
import zlib
from pathlib import Path

HERE = Path(__file__).parent
HEAD = "---\ntitle: T\n---\n\n"
SURVEY = "---\ntitle: T\nmode: survey\n---\n\n"

# name -> (markdown, marker text on the line that must be reported, message substring)
INVALID = {
    "fm-missing-title": (
        "---\ndescription: x\n---\n\n## Q\n\n- [x] a\n- [ ] b\n",
        "---",
        "missing required key 'title'",
    ),
    "fm-unknown-key": (
        "---\ntitle: T\ntime_limt: 5m\n---\n\n## Q\n\n- [x] a\n- [ ] b\n",
        "time_limt",
        "unknown key 'time_limt'",
    ),
    "fm-bad-time-limit": (
        "---\ntitle: T\ntime_limit: soon\n---\n\n## Q\n\n- [x] a\n- [ ] b\n",
        "time_limit",
        "bad duration",
    ),
    "fm-bad-enum": (
        "---\ntitle: T\nfeedback: later\n---\n\n## Q\n\n- [x] a\n- [ ] b\n",
        "feedback",
        "feedback",
    ),
    "fm-no-front-matter": (
        "## Q\n\n- [x] a\n- [ ] b\n",
        "## Q",
        "missing YAML front matter",
    ),
    "heading-h3": (
        HEAD + "### Sub\n\n## Q\n\n- [x] a\n- [ ] b\n",
        "### Sub",
        "use ## for questions",
    ),
    "duplicate-id": (
        HEAD + "## A {id=x}\n\n- [x] a\n- [ ] b\n\n## B {id=x}\n\n- [x] a\n- [ ] b\n",
        "## B",
        "duplicate question id",
    ),
    "ordering-one-item": (
        HEAD + "## Q {type=ordering}\n\n1. only\n",
        "## Q",
        "at least two items",
    ),
    "ordering-no-list": (
        HEAD + "## Q {type=ordering}\n\nNo list here.\n",
        "## Q",
        "at least two items",
    ),
    "ordering-duplicate-item": (
        HEAD + "## Q {type=ordering}\n\n1. a\n2. b\n3. a\n",
        "3. a",
        "duplicate ordering item",
    ),
    "ordering-answer-block": (
        HEAD + "## Q {type=ordering}\n\n1. a\n2. b\n\n```answer\nvalue: 1\n```\n",
        "```answer",
        "take no ```answer block",
    ),
    "matching-missing-separator": (
        HEAD + "## Q {type=matching}\n\n- a :: 1\n- b 2\n",
        "- b 2",
        "needs '::'",
    ),
    "matching-empty-right": (
        HEAD + "## Q {type=matching}\n\n- a ::\n- b :: y\n",
        "- a ::",
        "nothing after '::'",
    ),
    "matching-duplicate-right": (
        HEAD + "## Q {type=matching}\n\n- a :: x\n- b :: x\n",
        "- b :: x",
        "duplicate right-hand item",
    ),
    "matching-one-pair": (
        HEAD + "## Q {type=matching}\n\n- a :: x\n- :: y\n",
        "## Q",
        "at least two 'left :: right' pairs",
    ),
    "single-two-checked-explicit": (
        HEAD + "## Q {type=single}\n\n- [x] a\n- [x] b\n",
        "## Q",
        "exactly one choice",
    ),
    "single-one-item": (
        HEAD + "## Q {type=single}\n\n- [x] a\n",
        "## Q",
        "at least two choices",
    ),
    "single-none-checked": (
        HEAD + "## Q\n\n- [ ] a\n- [ ] b\n",
        "## Q",
        "no correct choice",
    ),
    "multi-none-checked": (
        HEAD + "## Q {type=multi}\n\n- [ ] a\n- [ ] b\n",
        "## Q",
        "at least one choice",
    ),
    "multi-one-item": (
        HEAD + "## Q {type=multi}\n\n- [x] a\n",
        "## Q",
        "at least two choices",
    ),
    "answer-missing": (
        HEAD + "## Q {type=numeric}\n\nText.\n",
        "## Q",
        "missing ```answer block",
    ),
    "answer-on-choice": (
        HEAD + "## Q\n\n- [x] a\n- [ ] b\n\n```answer\nvalue: 1\n```\n",
        "```answer",
        "take no ```answer block",
    ),
    "answer-yaml-error": (
        HEAD + "## Q {type=numeric}\n\n```answer\nvalue: 1\nunit: [oops\n```\n",
        "unit: [oops",
        "not valid YAML",
    ),
    "numeric-not-number": (
        HEAD + "## Q {type=numeric}\n\n```answer\nvalue: one\n```\n",
        "value: one",
        "'value' must be a number, got 'one'",
    ),
    "numeric-negative-tolerance": (
        HEAD + "## Q {type=numeric}\n\n```answer\nvalue: 1\ntolerance: -1\n```\n",
        "```answer",
        "must not be negative",
    ),
    "numeric-both-tolerances": (
        HEAD
        + "## Q {type=numeric}\n\n```answer\nvalue: 1\ntolerance: 1\nrel_tolerance: 0.1\n```\n",
        "```answer",
        "not both",
    ),
    "short-empty-accept": (
        HEAD + "## Q {type=short}\n\n```answer\naccept: []\n```\n",
        "```answer",
        "at least one 'accept'",
    ),
    "short-bad-regex": (
        HEAD + '## Q {type=short}\n\n```answer\npatterns: ["(abc"]\n```\n',
        "patterns:",
        "invalid regex",
    ),
    "short-lookbehind": (
        HEAD + '## Q {type=short}\n\n```answer\npatterns: ["(?<=a)b"]\n```\n',
        "patterns:",
        "lookbehind",
    ),
    "short-named-group": (
        HEAD + '## Q {type=short}\n\n```answer\npatterns: ["(?P<n>a)"]\n```\n',
        "patterns:",
        "named groups",
    ),
    "fields-bad-regex": (
        HEAD
        + '## Q {type=fields}\n\n```answer\nfields:\n  - label: x\n    patterns: ["["]\n```\n',
        "patterns:",
        "invalid regex",
    ),
    "fields-empty": (
        HEAD + "## Q {type=fields}\n\n```answer\nfields: []\n```\n",
        "fields:",
        "at least one entry",
    ),
    "blanks-none": (
        HEAD + "## Q {type=blanks}\n\nNo blanks here.\n",
        "## Q",
        "at least one [[answer]]",
    ),
    "blanks-in-wrong-type": (
        HEAD + "## Q {type=short}\n\nFill [[x]].\n\n```answer\naccept: [x]\n```\n",
        "Fill",
        "only work in type=blanks",
    ),
    "blanks-in-math": (
        HEAD + "## Q {type=blanks}\n\nSolve $a + [[b]]$ now.\n",
        "Solve",
        "inside math",
    ),
    "blanks-with-answer-block": (
        HEAD + "## Q {type=blanks}\n\nA [[b]].\n\n```answer\nx: 1\n```\n",
        "```answer",
        "take no ```answer block",
    ),
    "media-missing": (
        HEAD + "## Q\n\n![chart](assets/nope.png)\n\n- [x] a\n- [ ] b\n",
        "nope.png",
        "file not found",
    ),
    "media-bad-ext": (
        HEAD + "## Q\n\n![doc](assets/file.xyz)\n\n- [x] a\n- [ ] b\n",
        "file.xyz",
        "unsupported media type",
    ),
    "media-video": (
        HEAD + "## Q\n\n![clip](assets/clip.mp4)\n\n- [x] a\n- [ ] b\n",
        "clip.mp4",
        "video is not supported",
    ),
    "media-remote": (
        HEAD + "## Q\n\n![x](https://example.com/a.png)\n\n- [x] a\n- [ ] b\n",
        "example.com",
        "remote or absolute URL",
    ),
    "unknown-type": (HEAD + "## Q {type=lottery}\n\nText.\n", "## Q", "unknown type"),
    "unknown-attribute": (
        HEAD + "## Q {pts=3}\n\n- [x] a\n- [ ] b\n",
        "## Q",
        "unknown attribute 'pts'",
    ),
    "no-type-no-choices": (
        HEAD + "## Q\n\nJust text.\n",
        "## Q",
        "cannot infer the question type",
    ),
    "no-questions": (HEAD + "Just an intro.\n", "---", "no questions"),
    "truefalse-not-bool": (
        HEAD + "## Q {type=truefalse}\n\n```answer\nvalue: maybe\n```\n",
        "value: maybe",
        "true or false",
    ),
    "fm-bad-mode": (
        "---\ntitle: T\nmode: poll\n---\n\n## Q\n\n- [x] a\n- [ ] b\n",
        "mode",
        "mode",
    ),
    "survey-correct-choice": (
        SURVEY + "## Q\n\n- [x] a\n- [ ] b\n",
        "- [x] a",
        "survey questions have no correct choice; remove the [x]",
    ),
    "survey-pass-mark": (
        "---\ntitle: T\nmode: survey\npass_mark: 50\n---\n\n## Q\n\n- [ ] a\n- [ ] b\n",
        "pass_mark",
        "pass_mark is not allowed in survey mode",
    ),
    "survey-pick": (
        "---\ntitle: T\nmode: survey\npick: 1\n---\n\n## Q\n\n- [ ] a\n- [ ] b\n",
        "pick",
        "pick is not allowed in survey mode",
    ),
    "survey-section-pick": (
        SURVEY + "# Part {pick=1}\n\n## Q\n\n- [ ] a\n- [ ] b\n",
        "# Part",
        "pick is not allowed in survey mode",
    ),
    "survey-instant-feedback": (
        "---\ntitle: T\nmode: survey\nfeedback: instant\n---\n\n## Q\n\n- [ ] a\n- [ ] b\n",
        "feedback",
        "feedback: instant is not allowed in survey mode",
    ),
    "survey-multi-scoring": (
        "---\ntitle: T\nmode: survey\nmulti_scoring: partial\n---\n\n## Q\n\n- [ ] a\n- [ ] b\n",
        "multi_scoring",
        "multi_scoring is not allowed in survey mode",
    ),
    "survey-graded-attr": (
        SURVEY + "## Q {graded=false}\n\n- [ ] a\n- [ ] b\n",
        "## Q",
        "survey mode makes every question ungraded",
    ),
    "survey-truefalse": (
        SURVEY + "## Q {type=truefalse}\n\n```answer\nvalue: true\n```\n",
        "## Q",
        "survey mode is not supported for truefalse",
    ),
    "ungraded-numeric": (
        HEAD + "## Q {type=numeric graded=false}\n\n```answer\nvalue: 1\n```\n",
        "## Q",
        "`graded=false` is not supported for numeric; use single, short or fields",
    ),
    "ungraded-correct-choice": (
        HEAD + "## Q {graded=false}\n\n- [x] a\n- [ ] b\n",
        "- [x] a",
        "ungraded questions have no correct choice; remove the [x]",
    ),
    "ungraded-short-answer-block": (
        HEAD + "## Q {type=short graded=false}\n\n```answer\naccept: [x]\n```\n",
        "```answer",
        "an ungraded short question takes no ```answer block",
    ),
    "ungraded-fields-with-value": (
        HEAD
        + "## Q {type=fields graded=false}\n\n```answer\nfields:\n  - label: A\n    value: 3\n```\n",
        "```answer",
        "an ungraded fields question takes no value/accept/patterns",
    ),
    "ungraded-essay-rubric": (
        HEAD
        + "## Q {type=essay graded=false}\n\n```answer\nrubric:\n  - Clarity\n```\n",
        "rubric",
        "an ungraded essay takes no rubric",
    ),
    "graded-not-bool": (
        HEAD + "## Q {graded=maybe}\n\n- [x] a\n- [ ] b\n",
        "## Q",
        "graded must be true or false",
    ),
    "scale-range-too-wide": (
        HEAD + "## Q {type=scale}\n\n```answer\nmin: 0\nmax: 11\n```\n",
        "```answer",
        "max - min must be between 1 and 10",
    ),
    "scale-label-outside": (
        HEAD + "## Q {type=scale}\n\n```answer\nlabels:\n  9: High\n```\n",
        "labels",
        "scale label 9 is outside the range 1 to 5",
    ),
    "scale-graded-true": (
        HEAD + "## Q {type=scale graded=true}\n",
        "## Q",
        "scale questions are always ungraded",
    ),
    "code-no-language": (
        HEAD + "## Q {type=code}\n\n```answer\nstarter: x\n```\n",
        "```answer",
        "missing required key 'language'",
    ),
    "input-on-ordering": (
        HEAD + "## Q {type=ordering}\n\n1. a\n2. b {input}\n",
        "2. b",
        "{input} only works on the choices",
    ),
    "input-on-truefalse-choice-list": (
        HEAD
        + "## Q {type=truefalse}\n\n- [x] a {input}\n- [ ] b\n\n```answer\nvalue: true\n```\n",
        "- [x] a",
        "{input} only works on single/multi",
    ),
    "input-on-heading": (
        HEAD + "## Q {input}\n\n- [x] a\n- [ ] b\n",
        "## Q",
        "not on the question heading",
    ),
    "input-empty-prompt": (
        HEAD + '## Q\n\n- [x] a\n- [ ] Other {input=""}\n',
        "Other",
        "empty prompt",
    ),
    "input-unquoted-prompt": (
        HEAD + "## Q\n\n- [x] a\n- [ ] Other {input=What is it?}\n",
        "Other",
        'write {input} or {input="Prompt text"}',
    ),
    "input-unclosed-quote": (
        HEAD + '## Q\n\n- [x] a\n- [ ] Other {input="What}\n',
        "Other",
        "cannot parse",
    ),
}


def write_wav(path: Path) -> None:
    rate, secs, freq = 8000, 0.5, 440
    frames = b"".join(
        struct.pack("<h", int(12000 * math.sin(2 * math.pi * freq * i / rate)))
        for i in range(int(rate * secs))
    )
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(frames)


def write_png(path: Path, w: int = 64, h: int = 32) -> None:
    def chunk(tag: bytes, data: bytes) -> bytes:
        body = tag + data
        return (
            struct.pack(">I", len(data))
            + body
            + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)
        )

    raw = (
        b"".join(
            b"\x00"
            + bytes(
                (x * 4 % 256, y * 8 % 256, 160) * 1
                for x in range(w)
                for _ in [0]
                for y in [y_]
            )
            for y_ in range(h)
        )
        if False
        else b""
    )
    rows = []
    for y in range(h):
        row = bytearray([0])
        for x in range(w):
            row += bytes((x * 4 % 256, y * 8 % 256, 160))
        rows.append(bytes(row))
    raw = b"".join(rows)
    png = b"\x89PNG\r\n\x1a\n" + chunk(
        b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)
    )
    png += chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")
    path.write_bytes(png)


def main() -> None:
    (HERE / "assets").mkdir(exist_ok=True)
    write_wav(HERE / "assets" / "beep.wav")
    write_png(HERE / "assets" / "gradient.png")
    inv = HERE / "invalid"
    inv.mkdir(exist_ok=True)
    table = {}
    for name, (text, marker, msg) in INVALID.items():
        (inv / f"{name}.md").write_text(text, encoding="utf-8", newline="\n")
        line = next(n for n, ln in enumerate(text.split("\n"), 1) if marker in ln)
        table[name] = {"line": line, "message": msg}
    (inv / "expected.json").write_text(json.dumps(table, indent=2), encoding="utf-8")
    print(f"wrote {len(table)} invalid fixtures")


if __name__ == "__main__":
    main()
