import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { type CheckOptions, checkFile } from "../src/cli/check";
import { BUILT_IN } from "../src/cli/templates";
import { capture } from "./helpers/cli";

const root = resolve(import.meta.dirname, "..");
const dist = join(root, "dist", "templates");
// the sources of the built-in templates: examples/<name>/ and templates/blank/ (scripts/build-templates.mjs)
const source = (name: string): string => join(root, name === "blank" ? "templates/blank" : `examples/${name}`);
const opts: CheckOptions = { profile: null, config: null, strict: false, review: null, json: false, plain: true };

const tree = (dir: string, prefix = ""): string[] =>
  readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? tree(join(dir, e.name), `${prefix}${e.name}/`) : [`${prefix}${e.name}`]))
    .sort();

describe("the built-in templates in dist/templates", () => {
  it("are the seven names COMMANDS.md lists, and no others", () => {
    expect(readdirSync(dist).sort()).toEqual([...BUILT_IN].sort());
  });

  for (const name of BUILT_IN) {
    it(`${name}: its files are its source's quiz, assets and materials, byte for byte`, () => {
      const from = source(name);
      const wanted = tree(from).filter((f) => (f.endsWith(".md") ? !f.includes("/") : /^(assets|materials)\//.test(f)));
      expect(tree(join(dist, name))).toEqual(wanted);
      for (const f of wanted)
        expect(readFileSync(join(dist, name, f)).equals(readFileSync(join(from, f))), f).toBe(true);
    });

    it(`${name}: passes check`, () => {
      expect(existsSync(join(dist, name, "quiz.md"))).toBe(true);
      const c = capture(root);
      const result = checkFile(join(dist, name, "quiz.md"), opts, c.io);
      expect(result.status).toBe("ok");
    });
  }
});
