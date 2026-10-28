import type { AssetRef } from "../ir";
import type { Issue } from "../issue";
import { scanBlanks } from "./blanks";
import { outline } from "./outline";
import { Reporter } from "./report";
import { parseTaskMarker } from "./task-list";

const ITEM = /^\s*(?:[-*+]|\d+[.)])\s+(\[.*)$/;

/** A materials sheet, read (QUIZ_SYNTAX.md, section 2, "Materials"). */
export type ParsedSheet = {
  /** the text of the sheet's `#` heading, inline Markdown as written; null when it has none */
  name: string | null;
  /** the sheet's text, unchanged */
  source: string;
  /** the images and audio it refers to, as written, relative to the sheet's own folder */
  assets: AssetRef[];
  /** every problem, with `file` = `path` and the line in the sheet */
  issues: Issue[];
};

/**
 * Parses a materials sheet: ordinary Markdown with one `#` heading, its name. Pure: the loader reads the file.
 * It raises `materials.heading`, `materials.empty` (a warning) and the Markdown rules of a
 * quiz (raw HTML, alt text, containers, a second `#`). `materials.question` is raised for question syntax.
 */
export function parseSheet(text: string, path: string): ParsedSheet {
  const r = new Reporter(path);
  const body = text.replace(/^﻿/, "");
  // One empty line in front, so that the file is never read as having front matter, and markdown-it's 0-based
  // line numbers are the sheet's 1-based ones.
  const o = outline(`\n${body}`);
  const assets: AssetRef[] = o.images.map((i) => ({ path: i.src, line: i.line }));

  for (const h of o.rawHtml) {
    r.error(
      "markdown.raw-html",
      h.line,
      `raw HTML ${h.tag} is not allowed in a sheet`,
      "use the Markdown extensions of QUIZ_SYNTAX.md, section 8",
    );
  }
  for (const i of o.images) {
    if (i.alt.trim() === "") {
      r.error(
        "asset.alt",
        i.line,
        `the image "${i.src}" has no alt text`,
        "write a short description between the brackets: ![chart of the pole](assets/pole.png)",
      );
    }
  }

  // -- the name: one `#` heading, first
  const units = o.units;
  const first = units[0];
  let name: string | null = null;
  let headingLine = 1;
  if (!first) {
    r.error("materials.heading", 1, "the sheet is empty", "start the sheet with a # heading, its name");
  } else if (first.kind === "heading" && first.level === 1) {
    name = headingText(o.lines[first.start] ?? "");
    headingLine = first.start;
  } else {
    r.error(
      "materials.heading",
      first.start,
      "a sheet starts with a # heading, its name",
      "put the name of the sheet on the first line: # Formulas",
    );
  }
  let named = name !== null;
  for (const u of units.slice(1)) {
    if (u.kind === "heading" && u.level === 1 && !named) named = true;
    else if (u.kind === "heading" && u.level === 1) {
      r.error(
        "materials.heading",
        u.start,
        "a sheet has one # heading, its name",
        "use ## for a part of the sheet, or put the part in another sheet",
      );
    }
  }
  if (first && name !== null && units.length === 1) {
    r.warning(
      "materials.empty",
      headingLine,
      "the sheet has a heading and nothing after it",
      "write the sheet or remove it from `materials`",
    );
  }

  // -- containers belong in questions and sections
  for (const u of units) {
    if (u.kind === "container") {
      r.error(
        "syntax.container",
        u.start,
        u.closed ? `a sheet holds no \`::: ${u.name}\` container` : `the \`::: ${u.name}\` container is never closed`,
        "containers belong in a question or a section; remove it from the sheet",
      );
    } else if (u.kind === "stray-closer") {
      r.error("syntax.container", u.start, "a closing ::: with no container open", "remove it");
    }
  }

  // -- question syntax, which would never be scored
  const question = (line: number, what: string) =>
    r.error(
      "materials.question",
      line,
      `${what} in a sheet: a sheet holds no questions`,
      "sample questions in a sheet are not supported yet; write the example as text",
    );
  const fenced = new Set<number>();
  for (const u of units) {
    if (u.kind !== "fence") continue;
    for (let i = u.start; i < u.end; i++) fenced.add(i);
    if (u.info.split(/\s+/)[0] === "answer") question(u.start, "an `answer` block");
  }
  for (const u of units) {
    if (u.kind === "heading" && /\{[^}]*\btype=/.test(o.lines[u.start] ?? "")) {
      question(u.start, "a `{type=…}` attribute");
    }
  }
  for (let i = 1; i < o.lines.length; i++) {
    if (fenced.has(i)) continue;
    const item = ITEM.exec(o.lines[i] ?? "");
    if (item && parseTaskMarker(item[1] ?? "")) question(i, "a choice marked [x] or [ ]");
  }
  for (const c of o.chunks) {
    if (c.mode !== "markdown") continue;
    for (const b of scanBlanks(c.text, c.line, "markdown").blanks) question(b.line, "a blank [[…]]");
  }

  r.issues.sort((a, b) => a.line - b.line);
  return { name, source: text, assets, issues: r.issues };
}

/** `# Formulas {#x}` is not special in a sheet: the name is the text after the `#`s, without closing `#`s. */
function headingText(line: string): string {
  return line
    .replace(/^\s{0,3}#+/, "")
    .replace(/\s+#+\s*$/, "")
    .trim();
}
