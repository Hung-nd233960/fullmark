// Makes test/fixtures/stats/reports/*.json for `quiz stats`' tests: five attempts at two versions of quiz-v1.md and
// quiz-v2.md. The results files are written here (what the page would save); every report is made by running
// `node dist/cli.js grade --json`, never by hand, and the grades are filled into the template that `grade --json`
// writes. Run `npm run build` first, then `node scripts/make-stats-fixture.mjs`.
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const cli = join(root, "dist", "cli.js");
const fixtures = join(root, "test", "fixtures", "stats");
const work = mkdtempSync(join(tmpdir(), "fullmark-stats-"));

const run = (args) => {
  const r = spawnSync("node", [cli, ...args], { cwd: work, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`quiz ${args.join(" ")} failed (${r.status}): ${r.stdout}${r.stderr}`);
  return r.stdout;
};

for (const v of ["v1", "v2"]) cpSync(join(fixtures, `quiz-${v}.md`), join(work, `quiz-${v}.md`));
// a survey (another quiz id), from the example
cpSync(join(root, "examples", "survey", "quiz.md"), join(work, "quiz-survey.md"));
cpSync(join(root, "examples", "survey", "quiz.md"), join(fixtures, "quiz-survey.md"));
const hash = (v) => JSON.parse(run(["inspect", `quiz-${v}.md`, "--json"])).quiz.hash;
const hashes = { v1: hash("v1"), v2: hash("v2"), survey: hash("survey") };

const WRITING = {
  add: "The transform maps a signal to the frequency domain; we apply it to input and output and divide.",
  ielts: "I agree to a large extent. Cities that invest in cycling routes see less traffic and cleaner air.",
};
const choice = (n) => ({ choice: n });
const text = (t) => ({ text: t });

// each attempt: version, plan, answers, when, and the marks a grader gives the essays (null: not graded)
const attempts = [
  {
    name: "a1",
    version: "v1",
    plan: { source: "full", questions: ["prime", "even", "syll", "odd", "add", "ielts"] },
    answers: {
      prime: choice(0),
      even: { value: true },
      syll: choice(1),
      odd: choice(0),
      add: text(WRITING.add),
      ielts: text(WRITING.ielts),
    },
    at: "2026-10-03T10:00:00",
    marks: { add: { defs: 0.5, derive: 0.75, interp: 0.25 }, ielts: { TR: 5, CC: 5.5, LR: 5, GRA: 5.5 } },
  },
  {
    name: "a2",
    version: "v1",
    plan: { source: "section", section: "part-two", questions: ["add", "ielts"] },
    answers: { add: text(WRITING.add), ielts: text(WRITING.ielts) },
    at: "2026-10-10T10:00:00",
    marks: { add: { defs: 0.5, derive: 1, interp: 0.5 }, ielts: { TR: 6, CC: 5.5, LR: 6, GRA: 5.5 } },
  },
  {
    name: "a3",
    version: "v2",
    plan: { source: "full", questions: ["prime", "even", "syll", "odd", "late", "add", "ielts"] },
    answers: {
      prime: choice(0),
      even: { value: true },
      syll: choice(0),
      odd: choice(2),
      late: choice(0),
      add: text(WRITING.add),
      ielts: text(WRITING.ielts),
    },
    at: "2026-10-17T10:00:00",
    marks: { add: { defs: 0.5, derive: 1.25, interp: 0.5 }, ielts: { TR: 6, CC: 6, LR: 6, GRA: 6.5 } },
  },
  {
    name: "a4",
    version: "v2",
    plan: { source: "full", questions: ["prime", "even", "syll", "odd", "late", "add", "ielts"] },
    answers: {
      prime: choice(0),
      even: { value: false },
      syll: choice(0),
      odd: choice(2),
      late: choice(1),
      add: text(WRITING.add),
      ielts: text(WRITING.ielts),
    },
    at: "2026-10-24T10:00:00",
    marks: { add: { defs: 0.5, derive: 1.5, interp: 0.75 }, ielts: { TR: 6.5, CC: 6, LR: 6, GRA: 6.5 } },
  },
  {
    name: "a5",
    version: "v2",
    plan: { source: "retry", questions: ["prime", "even", "syll", "late"] },
    answers: { prime: choice(1), even: { value: true }, syll: choice(0), late: choice(1) },
    at: "2026-10-31T10:00:00",
    marks: null,
  },
  {
    name: "s1",
    version: "survey",
    plan: { source: "full", questions: ["where", "prepare", "tools"] },
    answers: { where: choice(0), prepare: choice(1), tools: { choices: [0, 1] } },
    at: "2026-09-05T10:00:00",
    marks: null,
  },
  {
    name: "s2",
    version: "survey",
    plan: { source: "full", questions: ["where", "prepare", "tools"] },
    answers: { where: choice(1), prepare: choice(0), tools: { choices: [1, 4] } },
    at: "2026-10-05T10:00:00",
    marks: null,
  },
];

mkdirSync(join(fixtures, "results"), { recursive: true });
mkdirSync(join(fixtures, "reports"), { recursive: true });
for (const a of attempts) {
  const results = {
    format: "fullmark-results",
    version: 2,
    quizHash: hashes[a.version],
    plan: a.plan,
    state: {
      answers: a.answers,
      startedAt: a.at.replace("10:00:00", "09:50:00"),
      submittedAt: a.at,
      timeUsed: 600,
      sectionTime: {},
      flagged: [],
      checked: [],
      timedOut: false,
    },
    phase: "submitted",
  };
  const resultsFile = `${a.name}.json`;
  writeFileSync(join(work, resultsFile), `${JSON.stringify(results, null, 2)}\n`);
  writeFileSync(join(fixtures, "results", `${a.name}-${a.version}.json`), `${JSON.stringify(results, null, 2)}\n`);
  run(["grade", resultsFile, "--quiz", `quiz-${a.version}.md`, "--json"]);
  if (a.marks) {
    const grades = JSON.parse(readFileSync(join(work, `${a.name}-grades.json`), "utf8"));
    grades.grader = { kind: "human", name: "Fixture grader", at: a.at.replace("10:00:00", "18:00:00") };
    for (const [id, marks] of Object.entries(a.marks)) {
      const g = grades.grades[id];
      for (const [crit, mark] of Object.entries(marks)) {
        if (g.mode === "banded") g.criteria[crit].band = mark;
        else g.criteria[crit].score = mark;
        g.criteria[crit].note ??= "Fixture note.";
      }
      g.justification = "Fixture justification.";
      g.improvement = "Fixture improvement.";
    }
    writeFileSync(join(work, `${a.name}-grades.json`), `${JSON.stringify(grades, null, 2)}\n`);
    run(["grade", resultsFile, "--quiz", `quiz-${a.version}.md`, "--grades", `${a.name}-grades.json`, "--json"]);
  }
  cpSync(join(work, `${a.name}-report.json`), join(fixtures, "reports", `${a.name}-${a.version}-report.json`));
}
rmSync(work, { recursive: true, force: true });
console.log(`wrote ${attempts.length} results and reports under test/fixtures/stats`);
