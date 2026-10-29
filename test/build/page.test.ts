import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { sha256 } from "@noble/hashes/sha2.js";
import { utf8ToBytes } from "@noble/hashes/utils.js";
import { describe, expect, it } from "vitest";
import { buildPage, type PageOptions } from "../../src/build/page";
import { loadQuiz } from "../../src/cli/load";
import { parseResults } from "../../src/core/attempt";
import { grade } from "../../src/core/grade";
import { quizHash } from "../../src/core/hash";
import { decodeKey, toBase64 } from "../../src/core/keyblob";
import { parse } from "../../src/core/parse";
import { planFor } from "../../src/core/plan";
import type { KeyBlob, PageData } from "../../src/page/data";
import { createStore, exportFor, localStamp } from "../../src/page/store";

const root = resolve(import.meta.dirname, "..", "..");
const dist = join(root, "dist");
const runtime = readFileSync(join(dist, "page.js"), "utf8");
const css = readFileSync(join(dist, "page.css"), "utf8");
const options: PageOptions = { runtime, css, builtAt: "2026-10-28T10:00:00+07:00", version: "1.0.0-test" };

function load(path: string) {
  const loaded = loadQuiz(join(root, path));
  if (loaded.quiz === null || loaded.hash === null) throw new Error(`${path} does not load`);
  return { quiz: loaded.quiz, hash: loaded.hash, assets: loaded.assets };
}

const singles = load("test/fixtures/page/singles.md");

/** The data block of a page, as the runtime reads it. */
function dataOf(html: string): PageData {
  const m = /<script type="application\/json" id="fm-data">([\s\S]*?)<\/script>/.exec(html);
  return JSON.parse(m?.[1] ?? "null") as PageData;
}

describe("build page: determinism", () => {
  it("two builds with the same --built-at are byte-identical", () => {
    expect(buildPage([singles], options)).toBe(buildPage([singles], options));
  });

  it("the build time is in the generator meta and nowhere else", () => {
    const a = buildPage([singles], options);
    const b = buildPage([singles], { ...options, builtAt: "2026-10-29T10:00:00+07:00" });
    expect(a).toContain('<meta name="generator" content="fullmark 1.0.0-test; built 2026-10-28T10:00:00+07:00">');
    expect(a.replace("2026-10-28", "2026-10-29")).toBe(b);
  });
});

describe("build page: the answer key", () => {
  const html = buildPage([singles], options);
  const page = dataOf(html).quizzes[0];

  it("round-trips: the decoded key grades exactly as the quiz does", () => {
    const key = decodeKey(page?.key ?? "", singles.hash) as KeyBlob;
    const attempt = {
      quizHash: singles.hash,
      plan: planFor(singles.quiz, { source: "full", quizHash: singles.hash }),
      state: {
        answers: { prime: { choice: 1 }, capital: { choice: 0 }, gas: { choice: 1, inputs: { "1": "air" } } },
        startedAt: "2026-10-28T10:00:00",
        submittedAt: "2026-10-28T10:01:00",
        timeUsed: 60,
        sectionTime: {},
        flagged: [],
        checked: [],
        timedOut: false,
      },
      phase: "submitted" as const,
    };
    expect(grade(key.quiz, attempt)).toEqual(grade(singles.quiz, attempt));
    expect(key.explanations.prime).toContain("Seven has no divisors");
  });

  it("the page holds no answer in plain form", () => {
    // the runtime itself says "correct" (a status), and so does the CSS, so both are taken out; the rest is the page text and the data
    const text = html.replace(runtime, "").replace(css, "");
    expect(text).not.toContain("Seven has no divisors except");
    expect(text).not.toContain('"correct"');
    expect(JSON.stringify(page?.sections)).not.toContain("correct");
  });

  it("is deterministic, and only the quiz hash opens it", () => {
    expect(dataOf(buildPage([singles], options)).quizzes[0]?.key).toBe(page?.key);
    expect(() => decodeKey(page?.key ?? "", "0".repeat(64))).toThrow();
  });
});

describe("build page: the CSP", () => {
  const html = buildPage([singles], options);
  const csp = /http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(html)?.[1] ?? "";
  const hash = (text: string) => `'sha256-${toBase64(sha256(utf8ToBytes(text)))}'`;

  it("allows only the inline script and style, by hash", () => {
    const script = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1] ?? "";
    const style = /<style>([\s\S]*?)<\/style>/.exec(html)?.[1] ?? "";
    expect(script).toBe(runtime);
    expect(csp).toContain(`script-src ${hash(script)}`);
    expect(csp).toContain(`style-src ${hash(style)}`);
    expect(csp).toContain("default-src 'none'");
    expect(csp).not.toContain("connect-src");
    expect(csp).not.toContain("unsafe-inline");
  });

  it("the runtime holds no server code: no network call", () => {
    expect(runtime).not.toMatch(/fetch\(|XMLHttpRequest|WebSocket|sendBeacon|EventSource/);
  });
});

describe("page runtime budget", () => {
  it("is under 60 KB gzipped", () => {
    const size = gzipSync(Buffer.from(runtime)).length;
    console.log(`page runtime: ${runtime.length} bytes, ${size} bytes gzipped (limit ${60 * 1024})`);
    expect(size).toBeLessThan(60 * 1024);
  });
});

describe("two quizzes on one page (seam test)", () => {
  const second = load("test/fixtures/page/second.md");
  const html = buildPage([singles, second], options);
  const data = dataOf(html);

  it("renders both, with element ids scoped by quiz id", () => {
    expect(data.quizzes.map((q) => q.id)).toEqual(["singles", "second"]);
    for (const id of ["singles", "second", "singles/prime", "second/prime"]) expect(html).toContain(` id="${id}"`);
    const ids = [...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps two Attempts and exports each separately", () => {
    const store = createStore(data);
    const at = (minute: number, second = 0) => new Date(2026, 9, 28, 10, minute, second);
    store.start("singles", at(0));
    store.start("second", at(0));
    store.dispatch("singles", { type: "answer", question: "prime", answer: { choice: 1 } });
    store.dispatch("second", { type: "answer", question: "prime", answer: { choice: 1 } });
    store.submit("singles", at(1));
    expect(store.quizzes.get("singles")?.attempt.value.phase).toBe("submitted");
    expect(store.quizzes.get("second")?.attempt.value.phase).toBe("answering");
    expect(store.quizzes.get("second")?.graded.value).toBeNull();

    store.submit("second", at(2));
    const files = ["singles", "second"].map((id) => {
      const state = store.quizzes.get(id);
      if (!state) throw new Error(id);
      return exportFor(state, at(3, 4));
    });
    expect(files.map((f) => f.name)).toEqual([
      "singles-results-20261028-100304.json",
      "second-results-20261028-100304.json",
    ]);
    const read = files.map((f) => {
      const r = parseResults(f.text);
      if (!r.ok) throw new Error(r.message);
      return r.results;
    });
    expect(read.map((r) => r.quizHash)).toEqual([singles.hash, second.hash]);
    expect(read.map((r) => r.plan.questions.length)).toEqual([4, 1]);
    // "prime" is in both quizzes: the picks are kept apart, and graded against each quiz's own key
    expect(store.quizzes.get("singles")?.graded.value?.total.earned).toBe(1);
    expect(store.quizzes.get("second")?.graded.value?.total.earned).toBe(0);
  });
});

describe("the page store", () => {
  const data = dataOf(buildPage([singles], options));

  it("emits progress and submit on the attach point", () => {
    const store = createStore(data);
    const seen: string[] = [];
    store.events.on("progress", (e) => seen.push(`progress:${e.attempt.phase}`));
    store.events.on("submit", (e) => seen.push(`submit:${e.quizId}`));
    store.start("singles");
    store.dispatch("singles", { type: "answer", question: "prime", answer: { choice: 1 } });
    store.submit("singles");
    expect(seen).toEqual(["progress:answering", "progress:answering", "progress:submitted", "submit:singles"]);
  });

  it("an action out of phase changes nothing", () => {
    const store = createStore(data);
    store.dispatch("singles", { type: "answer", question: "prime", answer: { choice: 1 } });
    expect(store.quizzes.get("singles")?.attempt.value.state.answers).toEqual({});
    store.start("singles");
    store.submit("singles");
    store.dispatch("singles", { type: "answer", question: "prime", answer: { choice: 2 } });
    expect(store.quizzes.get("singles")?.attempt.value.state.answers).toEqual({});
  });

  it("keeps the {input} text with the pick", () => {
    const store = createStore(data);
    store.start("singles");
    store.dispatch("singles", { type: "answer", question: "gas", answer: { choice: 1, inputs: { "1": "air" } } });
    expect(store.quizzes.get("singles")?.attempt.value.state.answers.gas).toEqual({
      choice: 1,
      inputs: { "1": "air" },
    });
  });

  it("names the export stamp in local time", () => {
    expect(localStamp(new Date(2026, 0, 2, 3, 4, 5))).toBe("20260102-030405");
  });
});

describe("build page: script-safe data", () => {
  it("a title, a prompt and a choice holding </script> parse back to the same text", () => {
    const text = [
      "---",
      "title: A </script> title",
      "id: evil",
      "---",
      "",
      "## Prompt `</script>` end {type=single id=q1}",
      "",
      "- [x] choice `</script>` one",
      "- [ ] two",
      "",
    ].join("\n");
    const result = parse(text, "evil.md");
    expect(result.issues).toEqual([]);
    const html = buildPage([{ quiz: result.quiz as never, hash: quizHash(text, []), assets: [] }], options);
    const block = /<script type="application\/json" id="fm-data">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? "";
    expect(block).not.toContain("<");
    expect(block).toContain("\\u003c");
    const data = JSON.parse(block) as PageData;
    expect(data.quizzes[0]?.title).toBe("A </script> title");
    expect(data.quizzes[0]?.sections[0]?.questions[0]?.promptHtml).toContain("&lt;/script&gt;");
    expect(data.quizzes[0]?.sections[0]?.questions[0]).toMatchObject({
      choices: [{ html: expect.stringContaining("&lt;/script&gt;") }, {}],
    });
  });
});

describe("build page: what it refuses", () => {
  it("an empty list", () => {
    expect(() => buildPage([], options)).toThrow();
  });
});

describe("build page: sheets", () => {
  it("puts the sheets in the page data, as HTML in the order listed, and nothing else changes", () => {
    const sheets = [
      { path: "materials/a.md", name: "A", source: "# A\n\nsheet-text-a\n" },
      { path: "materials/b.md", name: "B", source: "# B\n\nsheet-text-b\n" },
    ];
    const dataOf = (html: string) => JSON.parse(/id="fm-data">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? "null");
    const data = dataOf(buildPage([{ ...singles, sheets }], options));
    expect(data.quizzes[0].materials.map((m: { name: string }) => m.name)).toEqual(["A", "B"]);
    expect(data.quizzes[0].materials[1].html).toContain("<p>sheet-text-b</p>");
    delete data.quizzes[0].materials;
    expect(data).toEqual(dataOf(buildPage([singles], options)));
  });
});
