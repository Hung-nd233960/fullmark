// Builds every example and every page fixture into samples/, with an index, for trying the page by hand.
// Run with `npm run samples` (it builds dist first). samples/ is git-ignored: regenerate it, never commit it.
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = "samples";
const CLI = join("dist", "cli.js");

// what to try in each page; a page without a line here still builds and is listed
const TRY = {
  "example-calculus": "instant feedback (Check on each question), maths, a 30-minute limit",
  "example-exam": "a 20-minute timed exam, feedback at the end",
  "example-ielts": "two essays with a rubric, a 60-minute limit, the Light theme",
  "example-medical": "instant feedback, almost every type: ordering (drag), matching, blanks, fields, numeric, essay",
  "example-rust": "a code question, highlighting, short answers, a 25-minute limit",
  "example-survey": "a questionnaire with no score: scales, ordering, free text",
  mockup: "the boards' content: three parts, a 40-minute limit, a flag; the closest page to the mockup",
  map: "the question map: three parts, every result state after Submit",
  materials: "materials: the stacked sidebar, sheet chips, the Materials tab after Submit, Materials on the start screen",
  parts: "the part picker: take the whole quiz or one part",
  timed: "a 90-second limit: let it run out to see the automatic submit",
  results: "the results card, the review filter, Retry missed",
  instant: "feedback: instant (Check locks each question)",
  types: "every simple type: multi, true/false, short, numeric, blanks, fields, scale",
  "types-vi": "the simple types with a Vietnamese interface (decimal comma)",
  chrome: "the top bar, status line and Focus mode",
  "chrome-vi": "the top bar and status line in Vietnamese",
  singles: "single-choice questions only",
  second: "a second, small quiz",
};

// empty the folder rather than remove it: on Windows another program (Explorer, a browser) may hold the folder itself
mkdirSync(OUT, { recursive: true });
for (const name of readdirSync(OUT)) rmSync(join(OUT, name), { recursive: true, force: true });

const sources = [
  ...readdirSync("examples", { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => ({ name: `example-${d.name}`, file: join("examples", d.name, "quiz.md") })),
  ...readdirSync(join("test", "fixtures", "page"))
    .filter((f) => f.endsWith(".md"))
    .map((f) => ({ name: f.slice(0, -3), file: join("test", "fixtures", "page", f) })),
];

const built = [];
for (const s of sources) {
  try {
    execFileSync(process.execPath, [CLI, "build", s.file, "-o", join(OUT, `${s.name}.html`)], { stdio: "pipe" });
    built.push(s);
  } catch (e) {
    console.error(`${s.file}: build failed\n${e.stderr?.toString() ?? e}`);
    process.exitCode = 1;
  }
}

const esc = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const rows = built
  .map((s) => `<li><a href="${s.name}.html">${s.name}</a> <span>${esc(TRY[s.name] ?? "")}</span> <code>${esc(s.file)}</code></li>`)
  .join("\n");
writeFileSync(
  join(OUT, "index.html"),
  `<!doctype html><meta charset="utf-8"><title>fullmark samples</title>
<style>body{font:16px/1.6 system-ui,sans-serif;max-width:60rem;margin:2rem auto;padding:0 1rem}li{margin:.4rem 0}span{color:#555}code{color:#888;font-size:.85em}</style>
<h1>fullmark samples</h1>
<p>Built from the current branch by <code>npm run samples</code>. Each page is offline: open it, answer, submit, export. Answers are autosaved per page in this browser; use Start over or New attempt to reset.</p>
<ul>
${rows}
</ul>
`,
);
console.log(`samples: ${built.length} of ${sources.length} pages in ${OUT}/ (open ${join(OUT, "index.html")})`);
