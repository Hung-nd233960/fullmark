import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { FONT_REGISTRY, type FontId } from "../core/fonts";
import type { Licences, Notice } from "../page/Licences";

const nodeRequire = createRequire(import.meta.url);

/** Packages the page runtime bundles, always: its notice comes from the package's own files. */
const RUNTIME: readonly { name: string; pkg: string }[] = [
  { name: "Preact", pkg: "preact" },
  { name: "Preact Signals", pkg: "@preact/signals" },
  { name: "Preact Signals Core", pkg: "@preact/signals-core" },
  { name: "Noble Hashes", pkg: "@noble/hashes" },
  { name: "Zod", pkg: "zod" },
];
const KATEX = { name: "KaTeX", pkg: "katex" };

type Package = { version: string; licence: string; text: string };

/** A package's folder: its `package.json` when it exports it, else the nearest folder above its entry that is named so. */
function packageRoot(pkg: string): string {
  try {
    return dirname(nodeRequire.resolve(`${pkg}/package.json`));
  } catch {
    let dir = dirname(nodeRequire.resolve(pkg));
    for (;;) {
      try {
        const json = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as { name?: string };
        if (json.name === pkg) return dir;
      } catch {
        // no package.json in this folder: look higher
      }
      const up = dirname(dir);
      if (up === dir) throw new Error(`cannot find the folder of ${pkg}`);
      dir = up;
    }
  }
}

function readPackage(pkg: string): Package {
  const root = packageRoot(pkg);
  const json = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { version: string; license: string };
  return { version: json.version, licence: json.license, text: readFileSync(join(root, "LICENSE"), "utf8") };
}

/** The `Copyright …` line of a licence file. */
const copyrightOf = (text: string): string => /^Copyright.*$/m.exec(text)?.[0].trim() ?? "";

/** The MIT licence's text without its title and copyright line: those are per package, in the list above it. */
const mitBody = (text: string): string => {
  const at = text.indexOf("Permission is hereby granted");
  if (at < 0) throw new Error("not an MIT licence text");
  return text.slice(at).trim().replace(/\r\n/g, "\n");
};

/** The OFL 1.1 text, from the font package's own licence file (its preamble to its end). */
const oflBody = (text: string): string => {
  const at = text.indexOf("SIL OPEN FONT LICENSE Version 1.1");
  if (at < 0) throw new Error("not an OFL licence text");
  return text.slice(at).trim().replace(/\r\n/g, "\n");
};

/**
 * The notices of what a page embeds and nothing else (TECHNICAL_DESIGN.md, section 3, "Licences"): the runtime's
 * packages always, KaTeX only with maths, each font only when embedded; the MIT text once, the OFL text once and only
 * with a font. The versions and copyright lines are read from the packages, so they cannot drift.
 */
export function licencesFor(options: { fonts: readonly FontId[]; maths: boolean }): Licences {
  const notices: Notice[] = [];
  let mit = "";
  for (const { name, pkg } of [...RUNTIME, ...(options.maths ? [KATEX] : [])]) {
    const p = readPackage(pkg);
    notices.push({ name, version: p.version, licence: p.licence, copyright: copyrightOf(p.text) });
    if (mit === "") mit = mitBody(p.text);
  }
  const fonts = options.fonts.map((id) => FONT_REGISTRY[id].notice).filter((n) => n !== null);
  notices.push(...fonts);
  const first = options.fonts.find((id) => FONT_REGISTRY[id].files.length > 0);
  const ofl =
    first === undefined
      ? null
      : oflBody(readPackage(FONT_REGISTRY[first].files[0]?.path.split("/").slice(0, 2).join("/") ?? "").text);
  return { notices, mit, ofl };
}
