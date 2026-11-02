import { FONT_REGISTRY, type FontId, type FontsChoice } from "../core/fonts";
import type { BuildInfo, Licences, Notice } from "../page/Licences";
import { NOTICE_PACKAGES, NOTICE_TEXTS, type NoticePackage } from "./notices-data";

/**
 * The notices of what a page embeds and nothing else (TECHNICAL_DESIGN.md, section 3, "Licences"): the runtime's
 * packages always, KaTeX only with maths, each font only when embedded; each distinct licence text once. Every name,
 * version, licence id, copyright line and text comes from `notices-data.ts`, which `npm run notices` makes from the
 * packages themselves, so this popup and `quiz --acknowledgements` cannot disagree.
 */
export function licencesFor(options: { fonts: readonly FontId[]; maths: boolean }): Licences {
  const fonts = options.fonts.map((id) => FONT_REGISTRY[id].package);
  // listed by the name shown, case-insensitively: the software first, then the fonts (owner, 2026-11-02)
  const byTitle = (a: NoticePackage, b: NoticePackage): number =>
    a.title.localeCompare(b.title, "en", { sensitivity: "base" });
  const software = NOTICE_PACKAGES.filter((p) => p.where.includes("page") || (options.maths && p.name === "katex"));
  const used = [
    ...software.sort(byTitle),
    ...fonts.flatMap((name) => NOTICE_PACKAGES.filter((p) => p.name === name)).sort(byTitle),
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

/**
 * The Information tab's list (TECHNICAL_DESIGN.md, section 3, "Licences"): build inputs only, so two builds of one quiz
 * stay byte-identical. The versions of what shapes the page come from `notices-data.ts`, as the notices do.
 */
export function infoFor(input: {
  version: string;
  builtAt: string;
  hash: string;
  fonts: readonly FontId[];
  maths: boolean;
  code: boolean;
  theme: string;
  look: string;
  given: { profile?: string | null; fonts?: FontsChoice | null; uiLang?: "en" | "vi" | null; strict?: boolean };
}): BuildInfo {
  const names = [
    "preact",
    ...(input.maths ? ["katex"] : []),
    ...(input.code ? ["shiki"] : []),
    ...input.fonts.map((id) => FONT_REGISTRY[id].package ?? ""),
  ];
  const packages = names.flatMap((name) => {
    const p = NOTICE_PACKAGES.find((n) => n.name === name);
    return p === undefined ? [] : [{ name: p.title, version: p.version }];
  });
  return {
    fullmark: input.version,
    quiz: input.hash.slice(0, 4),
    builtAt: input.builtAt,
    packages,
    options: {
      profile: input.given.profile ?? null,
      fonts: input.given.fonts ?? null,
      uiLang: input.given.uiLang ?? null,
      theme: input.theme,
      look: input.look,
      strict: input.given.strict ?? false,
    },
  };
}
