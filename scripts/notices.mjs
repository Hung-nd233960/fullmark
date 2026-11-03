// Builds what fullmark owes the packages it ships (TECHNICAL_DESIGN.md, section 3, "Licences"): THIRD_PARTY_NOTICES.md
// at the root and src/build/notices-data.ts, which `quiz --acknowledgements` and the page's Licences popup read.
// Run it with `npm run notices`; a test fails when the committed files differ from a fresh run.
//
// The list is worked out, never written by hand: esbuild's metafile for the CLI bundle and for the page runtime names
// every package that is bundled; KaTeX and the fonts a page can embed are added from their own packages. Each entry's
// version, licence id, copyright line and licence text come from the package's own files.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { CLI_BUNDLE, CLI_EXTERNAL, PAGE_BUNDLE, SERVE_BUNDLE } from "./bundles.mjs";

const root = resolve(import.meta.dirname, "..");

/** The licences fullmark accepts in what it ships. */
export const ALLOWED = ["MIT", "ISC", "BSD-2-Clause", "BSD-3-Clause", "Apache-2.0", "OFL-1.1"];

/** Packages a page embeds without bundling them: KaTeX's CSS and fonts, and the font files. */
const EMBEDDED = [
  { name: "katex", where: "maths", title: "KaTeX" },
  // not bundled and nothing of it is embedded: the page's colours come from its grammars; the Information tab names it
  { name: "shiki", where: "code", title: "Shiki" },
  { name: "@fontsource/be-vietnam-pro", where: "font", title: "Be Vietnam Pro" },
  { name: "@fontsource-variable/source-serif-4", where: "font", title: "Source Serif 4" },
  { name: "@fontsource-variable/lexend", where: "font", title: "Lexend" },
];
/** The names the page's Licences popup shows; any other package shows under its package name. */
const TITLES = {
  preact: "Preact",
  "@preact/signals": "Preact Signals",
  "@preact/signals-core": "Preact Signals Core",
  "@noble/hashes": "Noble Hashes",
  zod: "Zod",
};
/** A copyright line the package's licence file does not carry (Source Serif's file names only its publisher). test/notices.test.ts pins that file's SHA-256 and fails when it changes, so this line is checked again. */
const COPYRIGHT = {
  // the licence file runs its title and copyright on one line ("MIT License Copyright (c) 2025-Present [Bombshell contributors](https://bomb.sh/team)"), which the line finder does not take
  "@clack/core": "Copyright (c) 2025-Present Bombshell contributors (https://bomb.sh/team)",
  "@clack/prompts": "Copyright (c) 2025-Present Bombshell contributors (https://bomb.sh/team)",
  "@fontsource-variable/source-serif-4":
    "Copyright 2014-2021 Adobe Systems Incorporated (http://www.adobe.com/), with Reserved Font Name 'Source'.",
};
/** Where a licence text begins: the line that follows the title and the copyright lines. */
const BODY_STARTS = [
  "Permission is hereby granted",
  "Permission to use, copy, modify",
  "Redistribution and use in source and binary forms",
  "SIL OPEN FONT LICENSE Version 1.1",
  "Licensed under the Apache License",
  "Apache License",
];

const packagesOf = (metafile) => {
  const found = new Set();
  for (const input of Object.keys(metafile.inputs)) {
    const at = input.lastIndexOf("node_modules/");
    if (at < 0) continue;
    const parts = input.slice(at + "node_modules/".length).split("/");
    found.add(parts[0].startsWith("@") ? `${parts[0]}/${parts[1]}` : parts[0]);
  }
  return found;
};

/** The packages bundled into the CLI and into the page runtime, from the options they ship with (scripts/bundles.mjs). */
async function bundled() {
  const shared = { bundle: true, write: false, metafile: true, logLevel: "error", outdir: join(root, "dist-notices") };
  const page = await build({ ...PAGE_BUNDLE, ...shared, entryPoints: [join(root, "src/page/main.tsx")] });
  // the server module is a page script too (it ships inside a served page), so its packages count as the page's
  const serve = await build({ ...SERVE_BUNDLE, ...shared, entryPoints: [join(root, "src/serve/module.ts")] });
  const cli = await build({
    ...CLI_BUNDLE,
    ...shared,
    entryPoints: { cli: join(root, "src/cli/bin.ts"), main: join(root, "src/cli/main.ts") },
    external: CLI_EXTERNAL,
  });
  return { cli: packagesOf(cli.metafile), page: new Set([...packagesOf(page.metafile), ...packagesOf(serve.metafile)]) };
}

const normalise = (text) => text.replace(/\r\n/g, "\n");

function readPackage(name) {
  const dir = join(root, "node_modules", name);
  const json = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  const file = readdirSync(dir).find((f) => /^(licen[cs]e|copying)/i.test(f));
  const text = file === undefined ? "" : normalise(readFileSync(join(dir, file), "utf8"));
  const line = text.split("\n").find((l) => /^\s*Copyright\b/.test(l));
  const copyright =
    COPYRIGHT[name] ?? (line === undefined ? "" : line.trim().replace(/\s+\S+\.(ttf|otf|woff2?):.*$/, ""));
  const at = Math.min(...BODY_STARTS.map((s) => text.indexOf(s)).filter((i) => i >= 0), Infinity);
  const body = at === Infinity ? "" : text.slice(at).trim();
  return { version: json.version, licence: typeof json.license === "string" ? json.license : "", copyright, body };
}

/** Every component fullmark ships, sorted by package name, and the distinct licence texts they point to. */
export async function collect() {
  const { cli, page } = await bundled();
  const wanted = new Map();
  const add = (name, where, title) => {
    const entry = wanted.get(name) ?? { where: [], title };
    if (!entry.where.includes(where)) entry.where.push(where);
    wanted.set(name, entry);
  };
  for (const name of cli) add(name, "cli", TITLES[name]);
  for (const name of page) add(name, "page", TITLES[name]);
  for (const e of EMBEDDED) add(e.name, e.where, e.title);

  const texts = [];
  const packages = [...wanted.keys()]
    .sort((a, b) => a.localeCompare(b, "en"))
    .map((name) => {
      const p = readPackage(name);
      const key = p.body.replace(/\s+/g, " ");
      let index = texts.findIndex((t) => t.key === key && t.licence === p.licence);
      if (index < 0) {
        index = texts.length;
        texts.push({ key, licence: p.licence, body: p.body });
      }
      const w = wanted.get(name);
      return {
        name,
        title: w.title ?? name,
        version: p.version,
        licence: p.licence,
        copyright: p.copyright,
        text: index,
        where: ["cli", "page", "maths", "code", "font"].filter((x) => w.where.includes(x)),
      };
    });
  return { packages, texts: texts.map(({ licence, body }) => ({ licence, body })) };
}

/** What is wrong with a list: a package with no licence file or copyright line, or a licence outside the allow-list. */
export function problems({ packages, texts }) {
  const out = [];
  for (const p of packages) {
    if (!ALLOWED.includes(p.licence)) out.push(`${p.name} ${p.version}: licence "${p.licence}" is not one of ${ALLOWED.join(", ")}`);
    if ((texts[p.text]?.body ?? "") === "") out.push(`${p.name} ${p.version}: no licence text found in its package`);
    if (p.copyright === "") out.push(`${p.name} ${p.version}: no copyright line found in its package`);
  }
  return out;
}

const WHERE = { cli: "the CLI", page: "every page", maths: "pages with maths", code: "pages with highlighted code", font: "pages that embed the font" };

/** The text `quiz --acknowledgements` prints and THIRD_PARTY_NOTICES.md holds. */
export function render({ packages, texts }, own) {
  const out = [];
  out.push("# Third-party notices", "");
  out.push(
    "fullmark is released under the MIT licence below. It ships the components listed after it, in the command-line tool",
    "and in the pages it writes, each under the licence shown; their licence texts follow the list.",
    "",
    "## fullmark",
    "",
    "```text",
    own.trim(),
    "```",
    "",
    "## Components",
    "",
  );
  for (const p of packages) {
    out.push(
      `- **${p.name}** ${p.version}, ${p.licence}. ${p.copyright} (in: ${p.where.map((w) => WHERE[w]).join(", ")})`,
    );
  }
  out.push("", "## Licence texts", "");
  texts.forEach((t, i) => {
    const users = packages.filter((p) => p.text === i).map((p) => p.name);
    out.push(`### ${t.licence}`, "", `Applies to: ${users.join(", ")}.`, "", "```text", t.body, "```", "");
  });
  return `${out.join("\n").trimEnd()}\n`;
}

/** The generated TypeScript module: data only, so reading it costs nothing until it is imported. */
export function module({ packages, texts }, own, text) {
  return `// Generated by scripts/notices.mjs (npm run notices). Do not edit.
export type NoticePackage = {
  name: string;
  /** the name the page's Licences popup shows */
  title: string;
  version: string;
  /** the SPDX id from the package's package.json */
  licence: string;
  copyright: string;
  /** the index in NOTICE_TEXTS */
  text: number;
  where: readonly ("cli" | "page" | "maths" | "code" | "font")[];
};

export const NOTICE_PACKAGES: readonly NoticePackage[] = ${JSON.stringify(packages, null, 2)};

export const NOTICE_TEXTS: readonly { licence: string; body: string }[] = ${JSON.stringify(texts, null, 2)};

/** What \`quiz --acknowledgements\` prints: the same text as THIRD_PARTY_NOTICES.md. */
export const ACKNOWLEDGEMENTS: string = ${JSON.stringify(text)};
`;
}

/** The three files from a fresh run. */
export async function generate() {
  const data = await collect();
  const own = readFileSync(join(root, "LICENSE"), "utf8");
  const text = render(data, normalise(own));
  return { data, text, module: module(data, own, text) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { data, text, module: code } = await generate();
  const bad = problems(data);
  writeFileSync(join(root, "THIRD_PARTY_NOTICES.md"), text);
  writeFileSync(join(root, "src/build/notices-data.ts"), code);
  console.log(`notices: ${data.packages.length} components, ${data.texts.length} licence texts`);
  if (bad.length > 0) {
    for (const line of bad) console.error(`notices: ${line}`);
    process.exitCode = 1;
  }
  if (!existsSync(join(root, "THIRD_PARTY_NOTICES.md"))) process.exitCode = 1;
}
