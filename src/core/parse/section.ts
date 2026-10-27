import type { FrontMatter, Section, Text } from "../ir";
import { slug } from "../slug";
import { analyseHeading } from "./heading";
import { readPairs, readSectionAttrs, SECTION_ATTRS } from "./heading-attrs";
import { trimBlankLines, unclaimedLines } from "./lines";
import type { Outline, Unit } from "./outline";
import type { Reporter } from "./report";

/** A section's lines before its questions: 0-based, `end` exclusive (the first question or the next section). */
export type SectionRegion = {
  /** the `#` heading line, or null for the untitled section of a quiz with no `#` heading */
  heading: number | null;
  start: number;
  end: number;
  units: Unit[];
};

/**
 * Builds a section without its questions: the heading attributes, the intro (the Markdown between the heading and
 * the first question) and the passages in it.
 */
export function parseSectionHead(
  region: SectionRegion,
  o: Outline,
  fm: FrontMatter,
  r: Reporter,
): Omit<Section, "questions"> {
  const lines = o.lines;
  const line = (region.heading ?? region.start) + 1;
  let title: string | null = null;
  let attrs = { id: null as string | null, time: null as number | null, pick: null as number | null };
  if (region.heading !== null) {
    const parts = analyseHeading(lines[region.heading] ?? "") ?? { level: 1, text: "", block: null };
    title = parts.text.trim();
    attrs = readSectionAttrs(readPairs(parts, line, SECTION_ATTRS, r), line, r, fm.kind === "survey");
    if (title === "") r.error("syntax.value", line, "a section needs a title", "write the title after #");
  }

  const passages: Text[] = [];
  const claims: [number, number][] = [];
  let swallowed = region.end;
  for (const u of region.units) {
    if (u.start >= swallowed) break;
    if (u.kind === "container") {
      claims.push([u.start, u.closed ? u.end + 1 : region.end]);
      if (!u.closed) {
        r.error(
          "syntax.container",
          u.start + 1,
          `the \`::: ${u.name}\` container is never closed`,
          "end it with a line holding only :::",
        );
        swallowed = u.start;
      }
      if (u.nested) {
        r.error("syntax.container", u.start + 1, "containers do not nest");
      } else if (u.name === "passage") {
        const inner = lines.slice(u.start + 1, u.closed ? u.end : region.end);
        passages.push({ line: u.start + 2, text: trimBlankLines(inner).join("\n") });
      } else if (u.name === "hint" || u.name === "explanation") {
        r.error(
          "syntax.container",
          u.start + 1,
          `\`::: ${u.name}\` belongs in a question, not in a section's intro`,
          "move it below the question it belongs to",
        );
      } else {
        r.error(
          "syntax.container",
          u.start + 1,
          `unknown container \`::: ${u.name}\``,
          "the containers are hint, explanation and passage",
        );
      }
    } else if (u.kind === "stray-closer") {
      r.error("syntax.container", u.start + 1, "a closing ::: with no container open", "remove it");
    }
  }
  const first = region.heading === null ? region.start : region.heading + 1;
  const intro = unclaimedLines(lines, first, region.end, (i) => claims.some(([a, b]) => i >= a && i < b));

  const id = attrs.id ?? (title === null ? "" : slug(title));
  if (title !== null && id === "") {
    r.error("syntax.value", line, "the title gives an empty section id", "add id=... to the heading");
  }
  return { line, title, id, time: attrs.time, pick: attrs.pick, intro: trimBlankLines(intro).join("\n"), passages };
}
