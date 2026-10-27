import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadQuiz } from "../../src/cli/load";
import { quizHash } from "../../src/core/hash";
import { parse } from "../../src/core/parse";

const TEXT = [
  "---",
  "title: Đạo hàm",
  "---",
  "",
  "# Part {id=p}",
  "",
  "## First question {type=single id=one}",
  "",
  "- [x] Có",
  "- [ ] Không",
  "",
  "## Second question {type=multi id=two points=2}",
  "",
  "- [x] a",
  "- [x] b",
  "",
].join("\n");

const hashes = (text: string): Record<string, string> =>
  Object.fromEntries(
    (parse(text, "t.md").quiz?.sections ?? []).flatMap((s) => s.questions.map((q) => [q.prompt, q.hash] as const)),
  );

describe("encodings do not split a quiz's history", () => {
  const crlf = TEXT.replaceAll("\n", "\r\n");
  const bom = `﻿${TEXT}`;
  const nfd = TEXT.normalize("NFD");
  const spaces = TEXT.replaceAll("\n", "  \n").replace("Có", "Có\t");
  const variants: [string, string][] = [
    ["CRLF", crlf],
    ["a BOM", bom],
    ["NFD text", nfd],
    ["trailing spaces", spaces],
    ["CRLF, BOM and trailing spaces", `﻿${spaces.replaceAll("\n", "\r\n")}`],
    ["a final blank line", `${TEXT}\n\n`],
    ["no final newline", TEXT.trimEnd()],
  ];

  for (const [name, text] of variants) {
    it(`the same quiz hash with ${name}`, () => {
      expect(quizHash(text, [])).toBe(quizHash(TEXT, []));
    });

    it(`the same question hashes with ${name}`, () => {
      const want = hashes(TEXT);
      expect(Object.keys(want)).toHaveLength(2);
      if (name === "NFD text") {
        // NFD changes the prompt strings but not the hashes of the blocks
        expect(Object.values(hashes(text))).toEqual(Object.values(want));
      } else {
        expect(hashes(text)).toEqual(want);
      }
    });

    it(`parses to the same quiz with ${name}`, () => {
      if (name === "NFD text") return;
      const a = parse(text, "t.md");
      const b = parse(TEXT, "t.md");
      expect(a.issues).toEqual([]);
      expect(a.quiz).toEqual(b.quiz);
    });
  }
});

describe("question hashes", () => {
  const body = (q: string) => `---\ntitle: T\n---\n\n${q}`;
  const hashOf = (text: string) => Object.values(hashes(text))[0];

  it("are the same with an id in any position, and with different ids", () => {
    const last = hashOf(body("## Which? {type=single points=2 id=q-aaaaaa}\n\n- [x] a\n- [ ] b\n"));
    const first = hashOf(body("## Which? {id=q-bbbbbb type=single points=2}\n\n- [x] a\n- [ ] b\n"));
    const middle = hashOf(body("## Which? {type=single id=other points=2}\n\n- [x] a\n- [ ] b\n"));
    expect(last).toBeDefined();
    expect(first).toBe(last);
    expect(middle).toBe(last);
  });

  it("do not change when the question moves", () => {
    const a = "## A {type=single id=a}\n\n- [x] x\n- [ ] y\n";
    const b = "## B {type=single id=b}\n\n- [x] x\n- [ ] y\n";
    expect(hashes(body(`${a}\n${b}`))).toEqual(hashes(body(`${b}\n\n\n${a}`)));
  });

  it("change when the text of the question changes, and only that question's", () => {
    const a = "## A {type=single id=a}\n\n- [x] x\n- [ ] y\n";
    const b = "## B {type=single id=b}\n\n- [x] x\n- [ ] y\n";
    const before = hashes(body(`${a}\n${b}`));
    const after = hashes(body(`${a}\n${b.replace("[ ] y", "[ ] z")}`));
    expect(after.A).toBe(before.A);
    expect(after.B).not.toBe(before.B);
  });

  it("cover the hint and the explanation of the block", () => {
    const base = "## A {type=single id=a}\n\n- [x] x\n- [ ] y\n";
    const before = hashes(body(`${base}\n::: explanation\none\n:::\n`));
    const after = hashes(body(`${base}\n::: explanation\ntwo\n:::\n`));
    expect(after.A).not.toBe(before.A);
  });
});

describe("the quiz hash covers the assets' bytes", () => {
  it("changes when an asset's bytes change, and not when an unrelated file does", () => {
    const dir = mkdtempSync(join(tmpdir(), "fullmark-hash-"));
    try {
      cpSync(resolve(import.meta.dirname, "..", "..", "examples", "calculus"), dir, { recursive: true });
      const file = join(dir, "quiz.md");
      const before = loadQuiz(file);
      expect(before.issues).toEqual([]);
      expect(before.assets.length).toBeGreaterThan(0);
      const asset = join(dir, "assets", readdirSync(join(dir, "assets"))[0] ?? "");
      writeFileSync(join(dir, "unrelated.txt"), "x");
      expect(loadQuiz(file).hash).toBe(before.hash);
      const bytes = readFileSync(asset);
      bytes[bytes.length - 1] = (bytes[bytes.length - 1] ?? 0) ^ 0xff;
      writeFileSync(asset, bytes);
      expect(statSync(asset).size).toBe(bytes.length);
      expect(loadQuiz(file).hash).not.toBe(before.hash);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
