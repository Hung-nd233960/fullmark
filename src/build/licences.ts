import type { FontId } from "../core/fonts";
import { FONT_REGISTRY } from "../core/fonts";
import type { Licences, Notice } from "../page/Licences";
import { NOTICE_PACKAGES, NOTICE_TEXTS } from "./notices-data";

/**
 * The notices of what a page embeds and nothing else (TECHNICAL_DESIGN.md, section 3, "Licences"): the runtime's
 * packages always, KaTeX only with maths, each font only when embedded; each distinct licence text once. Every name,
 * version, licence id, copyright line and text comes from `notices-data.ts`, which `npm run notices` makes from the
 * packages themselves, so this popup and `quiz --acknowledgements` cannot disagree.
 */
export function licencesFor(options: { fonts: readonly FontId[]; maths: boolean }): Licences {
  const fonts = options.fonts.map((id) => FONT_REGISTRY[id].package);
  const used = [
    ...NOTICE_PACKAGES.filter((p) => p.where.includes("page") || (options.maths && p.name === "katex")),
    ...fonts.flatMap((name) => NOTICE_PACKAGES.filter((p) => p.name === name)),
  ];
  const notices: Notice[] = used.map((p) => ({
    name: p.title,
    version: p.version,
    licence: p.licence,
    copyright: p.copyright,
  }));
  const texts: Licences["texts"][number][] = [];
  for (const index of new Set(used.map((p) => p.text))) {
    const t = NOTICE_TEXTS[index];
    if (t !== undefined) texts.push({ licence: t.licence, body: t.body });
  }
  return { notices, texts };
}
