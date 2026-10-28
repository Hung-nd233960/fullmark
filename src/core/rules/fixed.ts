import { file } from "./example";
import type { FixedRule } from "./types";

type Raised = FixedRule["raisedBy"];

const WHY = "A quiz with this problem cannot be built or graded correctly, so no profile can relax it.";

/** One question around a body, for the examples. */
const q = (heading: string, body = "- [x] a\n- [ ] b") => file(`## ${heading}\n\n${body}`);

function fixed(
  id: string,
  raisedBy: Raised,
  summary: string,
  example: string,
  fix: string,
  why = WHY,
  level: FixedRule["level"] = "error",
): FixedRule {
  return { kind: "fixed", id, level, raisedBy, summary, why, example, fix };
}

const ANSWER = (type: string, block: string, extra = "") =>
  q(`Q {type=${type} id=q${extra}}`, `\`\`\`answer\n${block}\n\`\`\``);

/**
 * The fixed rules: QUIZ_SYNTAX.md section 8a, `ignore.invalid`, `config.ignored` and the `rubric.*` rules of
 * TECHNICAL_DESIGN.md section 6. The parser and the asset loader raise most of them; this is the catalogue, with
 * what `quiz rules RULE` shows. The ids are a contract: a rule is never renamed.
 */
export const FIXED_RULES: FixedRule[] = [
  // -- the file
  fixed(
    "syntax.front-matter",
    "parser",
    "no front matter, front matter that is not valid YAML, or no title",
    "## Q {type=single id=q}\n\n- [x] a\n- [ ] b\n",
    "start the file with --- , a title: line and --- ",
  ),
  fixed(
    "syntax.yaml",
    "parser",
    "an answer block whose YAML does not parse",
    ANSWER("numeric", "value: [1, 2"),
    "fix the YAML of the ```answer block: close the bracket, quote text that has a colon",
  ),
  fixed(
    "syntax.preamble",
    "parser",
    "text between the front matter and the first heading, or a question before the first # section",
    file("Some text before any heading.\n\n## Q {type=single id=q}\n\n- [x] a\n- [ ] b"),
    "put the text in `description` (the start screen) or in the intro of a section; put every question under a # section, or use no sections at all",
  ),
  fixed(
    "quiz.empty",
    "parser",
    "the quiz has no questions",
    file("# Part\n\nAn intro and no question."),
    "add a question: ## text {type=... id=...}",
  ),
  fixed(
    "syntax.unknown-key",
    "parser",
    "an unknown front-matter key, attribute or answer key",
    q("Q {type=single id=q pts=3}"),
    "use a key the syntax has; the message suggests the closest one",
  ),
  fixed(
    "syntax.value",
    "parser",
    "a value outside its allowed set or range",
    file("## Q {type=single id=q points=0}\n\n- [x] a\n- [ ] b", "title: T\nfeedback: sometimes"),
    "use a value from the set the message lists",
  ),
  fixed(
    "profile.unknown",
    "check",
    "a `profile:` in the front matter that is neither built in nor in the config",
    file("## Q {type=single id=q}\n\n- [x] a\n- [ ] b", "title: T\nprofile: exma"),
    "use a profile `quiz rules` knows (default, draft, exam, survey, or one from fullmark.toml), or define it in fullmark.toml",
  ),
  fixed(
    "syntax.attributes",
    "parser",
    "a {...} block that does not parse, or a name given twice",
    q("Q {type=single type=multi id=q}"),
    "write name=value pairs, quote a value that holds spaces, and give each name once",
  ),
  fixed(
    "syntax.heading-level",
    "parser",
    "a ### or deeper heading",
    file("## Q {type=single id=q}\n\n### Detail\n\n- [x] a\n- [ ] b"),
    "use ## for a question, and bold text for a label inside one",
  ),
  fixed(
    "syntax.container",
    "parser",
    "an unknown, unclosed, nested or stray ::: container, one in the wrong place, or a second passage in a section",
    file("## Q {type=single id=q}\n\n- [x] a\n- [ ] b\n\n::: hint\nNever closed."),
    "close a container with a line holding only :::, and use only hint, explanation and passage (a passage in a section's intro)",
  ),
  fixed(
    "markdown.raw-html",
    "parser",
    "any HTML tag or comment",
    q("Q {type=single id=q}", "A <b>bold</b> word.\n\n- [x] a\n- [ ] b"),
    "use the Markdown extensions of QUIZ_SYNTAX.md section 8: **bold**, H~2~O, ==mark==, ::: hint",
  ),
  // -- assets
  fixed(
    "asset.missing",
    "loader",
    "a referenced file does not exist",
    q("Q {type=single id=q}", "![chart](assets/nope.png)\n\n- [x] a\n- [ ] b"),
    "check the path, which is relative to the quiz file",
  ),
  fixed(
    "asset.outside",
    "loader",
    "a referenced file is outside the quiz folder",
    q("Q {type=single id=q}", "![chart](../chart.png)\n\n- [x] a\n- [ ] b"),
    "move the file into the quiz folder or below it",
    "A quiz from someone else could otherwise embed a private file into a page that is then published.",
  ),
  fixed(
    "asset.type",
    "loader",
    "a referenced file is of a type fullmark does not support",
    q("Q {type=single id=q}", "![clip](assets/clip.mp4)\n\n- [x] a\n- [ ] b"),
    "use png, jpg, gif, webp or svg for images; mp3, ogg, wav or m4a for audio. Video is not supported",
  ),
  fixed(
    "asset.remote",
    "loader",
    "a referenced file is a URL",
    q("Q {type=single id=q}", "![chart](https://example.com/chart.png)\n\n- [x] a\n- [ ] b"),
    "put the file in the quiz folder and refer to it by relative path",
    "A page makes no network request, so a remote file would never load.",
  ),
  fixed(
    "asset.alt",
    "parser",
    "an image without alt text",
    q("Q {type=single id=q}", "![](assets/chart.png)\n\n- [x] a\n- [ ] b"),
    "write a short description between the brackets: ![chart of the pole](assets/pole.png)",
    "Alt text is what a screen reader says, and what shows when the image cannot.",
  ),
  fixed(
    "materials.missing",
    "loader",
    "a `materials` file does not exist",
    file("## Q {type=single id=q}\n\n- [x] a\n- [ ] b", "title: T\nmaterials:\n  - materials/nope.md"),
    "check the path in `materials:`, which is relative to the quiz file; paths match letter case exactly",
  ),
  fixed(
    "materials.heading",
    "loader",
    "a sheet that does not start with a # heading, or has a second # heading",
    "# Formulas\n\nText.\n\n# Again\n",
    "start the sheet with one # heading, its name; use ## and ### for its parts",
  ),
  fixed(
    "materials.question",
    "loader",
    "question syntax in a sheet: a {type=…} attribute, a choice list with [x] or [ ], an answer block, or a blank [[…]]",
    "# Formulas\n\n## Q {type=single id=q}\n",
    "sample questions in a sheet are not supported yet; write the example as text",
  ),
  fixed(
    "theme.unknown",
    "parser",
    "a theme fullmark does not have",
    file("## Q {type=single id=q}\n\n- [x] a\n- [ ] b", "title: T\ntheme: neon"),
    "use auto, light, dark, oled, white or paper",
  ),
  fixed(
    "theme.unknown-font",
    "parser",
    "a font fullmark does not have",
    file("## Q {type=single id=q}\n\n- [x] a\n- [ ] b", "title: T\nfont: fancy"),
    "use system, sans, serif or readable",
  ),
  // -- sections
  fixed(
    "section.id-duplicate",
    "parser",
    "two sections with the same id",
    file(
      "# Part\n\n## A {type=single id=a}\n\n- [x] a\n- [ ] b\n\n# Part\n\n## B {type=single id=b}\n\n- [x] a\n- [ ] b",
    ),
    "give one of the sections an id=...",
  ),
  fixed(
    "section.pick",
    "parser",
    "pick below 1 or above the section's question count",
    file("# Part {pick=5}\n\n## A {type=single id=a}\n\n- [x] a\n- [ ] b"),
    "pick from 1 up to the number of questions",
  ),
  // -- questions
  fixed(
    "question.type-missing",
    "parser",
    "a question without type",
    file("## Q {id=q}\n\n- [x] a\n- [ ] b"),
    "add type=... : single, multi, truefalse, numeric, short, blanks, fields, ordering, matching, essay, code or scale",
  ),
  fixed(
    "question.id-missing",
    "parser",
    "a question without an id",
    file("## Q {type=single}\n\n- [x] a\n- [ ] b"),
    "run: quiz ids FILE",
    "An id is how results, stats and reviews follow a question across versions.",
  ),
  fixed(
    "question.id-duplicate",
    "parser",
    "two questions with one id",
    file("## A {type=single id=q}\n\n- [x] a\n- [ ] b\n\n## B {type=single id=q}\n\n- [x] a\n- [ ] b"),
    "delete the id from the copy and run: quiz ids FILE",
  ),
  fixed(
    "question.id-format",
    "parser",
    "an id that is not a valid slug",
    file("## Q {type=single id=Q_1}\n\n- [x] a\n- [ ] b"),
    "use lower-case letters, digits and -, starting with a letter, at most 64 characters",
  ),
  fixed(
    "question.prompt-empty",
    "parser",
    "a question heading with no prompt text",
    file("## {type=single id=q}\n\n- [x] a\n- [ ] b"),
    "write the question after ##",
  ),
  fixed(
    "question.container-twice",
    "parser",
    "two hints or two explanations on one question",
    q("Q {type=single id=q}", "- [x] a\n- [ ] b\n\n::: hint\nOne\n:::\n\n::: hint\nTwo\n:::"),
    "keep one hint and one explanation",
  ),
  fixed(
    "question.answer-block",
    "parser",
    "an answer block where the type needs none, or none where it needs one",
    q("Q {type=numeric id=q}", "No answer block here."),
    "add the ```answer block the type needs, or remove one it does not take",
  ),
  fixed(
    "question.trailing-text",
    "parser",
    "anything after the answer other than a hint or an explanation",
    q("Q {type=single id=q}", "- [x] a\n- [ ] b\n\nMore words after the choices."),
    "move the text above the answer, into the prompt, or into the explanation",
  ),
  fixed(
    "question.ungraded",
    "parser",
    "a type that cannot be ungraded, made ungraded, or graded= on a scale",
    q("Q {type=numeric id=q graded=false}", "```answer\nvalue: 1\n```"),
    "remove graded=false, or use a type that can be ungraded (single, multi, short, fields, essay, ordering)",
  ),
  fixed(
    "question.ungraded-key",
    "parser",
    "an answer key or rubric on an ungraded question",
    q("Q {type=single id=q graded=false}", "- [x] a\n- [ ] b"),
    "remove the [x], value, accept, patterns or rubric: an ungraded question has no right answer",
  ),
  // -- choices
  fixed(
    "choice.marker",
    "parser",
    "a choice without [ ] or [x]",
    q("Q {type=single id=q}", "- [x] a\n- b"),
    "start every choice with [ ] or [x]",
  ),
  fixed(
    "choice.count",
    "parser",
    "fewer than two choices",
    q("Q {type=single id=q}", "- [x] only one"),
    "write each choice as - [ ] text, with - [x] for the right one",
  ),
  fixed(
    "choice.correct-count",
    "parser",
    "a graded single without exactly one [x], or a graded multi with none",
    q("Q {type=single id=q}", "- [ ] a\n- [ ] b"),
    "mark one choice, or use type=multi",
  ),
  fixed(
    "choice.input",
    "parser",
    "{input} anywhere but the end of a choice, or an unquoted or empty prompt",
    q("Q {type=single id=q}", "- [x] a {input=What is it?}\n- [ ] b"),
    'end a choice with {input} or {input="What is it?"}',
  ),
  // -- numeric, short, blanks, fields, ordering, matching, essay, scale, code
  fixed(
    "numeric.value",
    "parser",
    "no value or values, both, a number that does not parse, both tolerances, or a negative tolerance",
    ANSWER("numeric", "tolerance: 0.1"),
    "give value: 3 (or values: [2, -2]) and at most one of tolerance and rel_tolerance",
  ),
  fixed(
    "short.key",
    "parser",
    "a graded short with neither accept nor patterns",
    ANSWER("short", "accept: []"),
    'list the accepted answers: accept: ["chain rule"]',
  ),
  fixed(
    "short.regex",
    "parser",
    "a pattern that is not valid in JavaScript's u mode",
    ANSWER("short", "patterns: ['(?<=a)b']"),
    "write a pattern without lookbehind and inline flags",
  ),
  fixed(
    "blanks.none",
    "parser",
    "a blanks question without blanks",
    q("Q {type=blanks id=q}", "No blank here."),
    "write the missing word as [[answer]]",
  ),
  fixed(
    "blanks.outside",
    "parser",
    "[[...]] in a question that is not blanks",
    q("Q {type=single id=q}", "The answer is [[x]].\n\n- [x] a\n- [ ] b"),
    "change the type to blanks, or remove the brackets",
  ),
  fixed(
    "blanks.in-math",
    "parser",
    "a blank inside maths",
    q("Q {type=blanks id=q}", "The value is $[[x]]$."),
    "move the blank out of the $...$",
  ),
  fixed(
    "blanks.syntax",
    "parser",
    "a malformed blank",
    q("Q {type=blanks id=q}", "The value is [[=abc]]."),
    "write [[answer|variant]] or [[=0.5±0.01]]",
  ),
  fixed(
    "fields.empty",
    "parser",
    "no fields, or a graded fields question with no graded field",
    ANSWER("fields", "fields: []"),
    "add fields: - label: ... with a value or accept on at least one",
  ),
  fixed(
    "fields.key",
    "parser",
    "a field with both numeric and text keys",
    ANSWER("fields", "fields:\n  - label: A\n    value: 3\n    accept: [three]"),
    "give a field value or accept, not both",
  ),
  fixed(
    "fields.points",
    "parser",
    "field points that are mixed or do not add up",
    ANSWER("fields", "fields:\n  - label: A\n    value: 1\n    points: 1\n  - label: B\n    value: 2", " points=4"),
    "give every graded field points that add up to the question's points, or none at all",
  ),
  fixed(
    "ordering.items",
    "parser",
    "fewer than two items, or duplicates",
    q("Q {type=ordering id=q}", "1. only one"),
    "list at least two different items, in the correct order",
  ),
  fixed(
    "matching.pairs",
    "parser",
    "fewer than two pairs, a bullet without ::, an empty right side, or a right-hand item used twice",
    q("Q {type=matching id=q}", "- a :: 1"),
    "write at least two pairs as - left :: right, with different right-hand items",
  ),
  fixed(
    "essay.words",
    "parser",
    "min_words above a non-zero max_words",
    ANSWER("essay", "min_words: 200\nmax_words: 100"),
    "make min_words at most max_words (0 means no maximum)",
  ),
  fixed(
    "scale.range",
    "parser",
    "max - min outside 1 to 10, or a label outside the range",
    ANSWER("scale", "min: 1\nmax: 20"),
    "keep the scale between 1 and 10 steps wide, with labels inside it",
  ),
  fixed(
    "code.language",
    "parser",
    "a code question without language",
    ANSWER("code", "starter: x"),
    "add language: python (or the language of the answer) to the answer block",
  ),
  // -- rubrics (raised by the grading slice)
  fixed(
    "rubric.mode-missing",
    "grading",
    "points or bands appear in a rubric without a mode",
    ANSWER("essay", "rubric:\n  criteria:\n    - Defines it (1 pts)"),
    "declare mode: additive (or banded)",
  ),
  fixed(
    "rubric.sum",
    "grading",
    "an additive rubric whose maximums do not add up to the question's points",
    ANSWER("essay", "rubric:\n  mode: additive\n  criteria:\n    - Defines it (1 pts)", " points=3"),
    "make the criteria's points add up to the question's points",
  ),
  fixed(
    "rubric.step",
    "grading",
    "a maximum that is not a multiple of step",
    ANSWER("essay", "rubric:\n  mode: additive\n  step: 0.5\n  criteria:\n    - Defines it (0.3 pts)"),
    "use a maximum that is a multiple of step",
  ),
  fixed(
    "rubric.scale",
    "grading",
    "a banded scale whose step does not divide max - min",
    ANSWER("essay", "rubric:\n  mode: banded\n  scale: {min: 0, max: 9, step: 2}"),
    "choose a step that divides the width of the scale",
  ),
  fixed(
    "rubric.weights",
    "grading",
    "a criterion weight that is not a positive number",
    ANSWER("essay", "rubric:\n  mode: banded\n  criteria:\n    - {id: tr, text: Task, weight: 0}"),
    "give every weight as a number above 0",
  ),
  fixed(
    "rubric.duplicate-id",
    "grading",
    "two criteria with the same id",
    ANSWER(
      "essay",
      "rubric:\n  mode: additive\n  criteria:\n    - {id: a, text: One, points: 1}\n    - {id: a, text: Two, points: 1}",
    ),
    "give each criterion its own id",
  ),
  // -- surveys and ignores
  fixed(
    "survey.forbidden",
    "parser",
    "in a survey: pass_mark, pick, feedback: instant, partial or graded=",
    file("## Q {type=single id=q}\n\n- [ ] a\n- [ ] b", "title: T\nkind: survey\npass_mark: 50"),
    "remove the key: a survey has no score",
  ),
  fixed(
    "ignore.invalid",
    "check",
    "check-ignore without because, or naming a rule that cannot be ignored",
    q('Q {type=single id=q check-ignore="choice.correct-longest"}'),
    'write check-ignore="rule" because="the reason", naming a quality rule: fixed rules cannot be ignored',
  ),
  fixed(
    "config.ignored",
    "check",
    "a finding was hidden by check-ignore (shown so that nothing is silently hidden)",
    q('Q {type=single id=q check-ignore="choice.correct-longest" because="the long answer is the point"}'),
    "none needed: it is information. Under a profile with allow-ignore = false it is an error",
    "Every ignore is reported, so a reader of the check output sees what was set aside and why.",
    "info",
  ),
];
