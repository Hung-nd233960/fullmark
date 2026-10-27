import type { AssetRef, Question, Quiz, Section } from "../ir";
import type { Issue } from "../issue";
import { parseFrontMatter } from "./front-matter";
import { outline, type Unit } from "./outline";
import { parseQuestion, type Region } from "./question";
import { Reporter } from "./report";
import { parseSectionHead, type SectionRegion } from "./section";

export type ParseResult = {
  /** null when there is any error: the IR is only ever built from a quiz without syntax errors */
  quiz: Quiz | null;
  issues: Issue[];
  /** every file the quiz refers to, with the line of the reference; the CLI resolves them */
  assets: AssetRef[];
};

type SectionDraft = SectionRegion & { questions: Region[] };

/**
 * Parses a quiz file (QUIZ_SYNTAX.md) into the IR. Pure: no file is read. Parsing continues after an error, so one
 * run reports every problem; the quiz is returned only when there is none. `file` is the name issues carry, and
 * the default quiz id is made from it.
 */
export function parse(text: string, file: string): ParseResult {
  const o = outline(text);
  const r = new Reporter(file);
  const fm = parseFrontMatter(o, file, r);

  for (const h of o.rawHtml) {
    r.error(
      "markdown.raw-html",
      h.line + 1,
      `raw HTML ${h.tag} is not allowed in a quiz`,
      "use the Markdown extensions of QUIZ_SYNTAX.md, section 8",
    );
  }
  const assets: AssetRef[] = o.images.map((i) => ({ path: i.src, line: i.line + 1 }));

  // -- cut the body into sections and questions at the `#` and `##` headings
  const drafts: SectionDraft[] = [];
  let section: SectionDraft | null = null;
  let question: Region | null = null;
  let preamble: Unit | null = null;
  const startSection = (heading: number | null, start: number): SectionDraft => {
    const draft: SectionDraft = { heading, start, end: o.lines.length, units: [], questions: [] };
    drafts.push(draft);
    question = null;
    return draft;
  };
  for (const u of o.units) {
    if (u.kind === "heading" && u.level === 1) {
      if (section) closeSection(section, u.start);
      section = startSection(u.start, u.start);
    } else if (u.kind === "heading" && u.level === 2) {
      if (!section) section = startSection(null, o.bodyStart);
      if (question) (question as Region).end = u.start;
      else section.end = u.start;
      question = { start: u.start, end: o.lines.length, units: [] };
      section.questions.push(question);
    } else if (u.kind === "heading") {
      r.error(
        "syntax.heading-level",
        u.start + 1,
        "only # (a section) and ## (a question) headings are allowed",
        "use ## for a question, and bold text for a label inside one",
      );
    } else if (question) {
      (question as Region).units.push(u);
    } else if (section) {
      section.units.push(u);
    } else if (!preamble) {
      preamble = u;
    }
  }
  if (section) closeSection(section, o.lines.length);
  function closeSection(s: SectionDraft, end: number): void {
    if (s.questions.length === 0) s.end = Math.min(s.end, end);
    const last = s.questions.at(-1);
    if (last && last.end > end) last.end = end;
  }
  if (preamble) {
    const at = (preamble as Unit).start;
    r.error(
      "syntax.preamble",
      at + 1,
      "text between the front matter and the first heading",
      "put it in `description`, or in the intro of a section",
    );
  }

  // -- build them
  const ids = new Map<string, number>();
  const sections: Section[] = [];
  const sectionIds = new Map<string, number>();
  for (const d of drafts) {
    const head = parseSectionHead(d, o, fm, r);
    if (head.title !== null && head.id !== "") {
      const seen = sectionIds.get(head.id);
      if (seen !== undefined) {
        r.error(
          "section.id-duplicate",
          head.line,
          `the section id "${head.id}" is already used on line ${seen}`,
          "give one of the sections an id=...",
        );
      } else sectionIds.set(head.id, head.line);
    }
    const questions: Question[] = d.questions.map((region) => parseQuestion(region, { o, fm, r, ids }));
    if (head.pick !== null && fm.kind !== "survey" && (head.pick < 1 || head.pick > questions.length)) {
      r.error(
        "section.pick",
        head.line,
        `pick=${head.pick}, but the section has ${questions.length} question${questions.length === 1 ? "" : "s"}`,
        "pick from 1 up to the number of questions",
      );
    }
    sections.push({ ...head, questions });
  }
  if (sections.every((s) => s.questions.length === 0)) {
    r.error("quiz.empty", 1, "the quiz has no questions", "add a question: ## text {type=... id=...}");
  }

  r.issues.sort((a, b) => a.line - b.line);
  const quiz: Quiz | null = r.hasErrors ? null : { file, frontMatter: fm, sections };
  return { quiz, issues: r.issues, assets };
}
