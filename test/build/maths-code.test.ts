import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { type Highlight, languagesUsed, loadHighlighter } from "../../src/build/highlight";
import { buildPage, type PageOptions, pageQuizOf } from "../../src/build/page";
import { createRenderer } from "../../src/build/render";
import { katexTools } from "../../src/build/tex";
import { loadQuiz } from "../../src/cli/load";
import { parse } from "../../src/core/parse";
import { KNOWN_LANGUAGES } from "../../src/core/rules/quality";
import type { PageData } from "../../src/page/data";

const root = resolve(import.meta.dirname, "..", "..");
const runtime = readFileSync(join(root, "dist", "page.js"), "utf8");
const css = readFileSync(join(root, "dist", "page.css"), "utf8");
const plainOptions: PageOptions = { runtime, css, builtAt: "2026-10-28T10:00:00+07:00", version: "1.0.0-test" };

function load(path: string) {
  const loaded = loadQuiz(join(root, path));
  if (loaded.quiz === null || loaded.hash === null) throw new Error(`${path} does not load`);
  return { quiz: loaded.quiz, hash: loaded.hash, assets: loaded.assets, sheets: loaded.sheets };
}

const dataOf = (html: string): PageData => {
  const m = /<script type="application\/json" id="fm-data">([\s\S]*?)<\/script>/.exec(html);
  return JSON.parse(m?.[1] ?? "null") as PageData;
};

/** The page without the runtime and the page styles, which hold `style=` and colour words of their own. */
const withoutRuntime = (html: string): string => html.replace(runtime, "").replace(css, "");

const mathsAndCode = load("test/golden/build/maths-and-code/input/quiz.md");
const plain = load("test/fixtures/page/singles.md");

describe("a quiz with no maths and no code pays nothing", () => {
  it("has no KaTeX styles or fonts, no highlighted markup and no extra data", async () => {
    const highlight = await loadHighlighter(languagesUsed(plain.quiz));
    const html = buildPage([plain], { ...plainOptions, math: katexTools(), highlight });
    const bare = buildPage([plain], plainOptions);
    expect(html).toBe(bare);
    for (const word of ["katex", "@font-face", "fm-hl", "fm-tk-", "hasMath", '"materials"']) {
      expect(withoutRuntime(html), word).not.toContain(word);
    }
  });

  it("loads no highlighter when no known language is used", async () => {
    expect(await loadHighlighter([])).toBeNull();
    expect(await loadHighlighter(["text", "nosuchlanguage"])).toBeNull();
  });
});

describe("maths in the page", () => {
  const tools = katexTools();

  // loads KaTeX and Shiki and builds the page with every font: 3 s idle, over 6 s when the machine is loaded
  it("is KaTeX's HTML with MathML, with the styles and fonts once, and no style attribute or font file", {
    timeout: 30_000,
  }, async () => {
    const highlight = await loadHighlighter(languagesUsed(mathsAndCode.quiz, mathsAndCode.sheets));
    const html = buildPage([mathsAndCode], { ...plainOptions, math: tools, highlight });
    const page = withoutRuntime(html);
    expect(page).toContain('class="katex"');
    expect(page).toContain("<math");
    expect(page.match(/<style id="fm-katex">/g)).toHaveLength(1);
    expect(page).toContain("url(data:font/woff2;base64,");
    expect(page).not.toMatch(/url\(fonts\//);
    expect(page).not.toMatch(/format\("(woff|truetype)"\)/);
    // the CSP allows no style attribute, so there is none; both stylesheets are allowed by hash
    expect(page).not.toMatch(/<[a-z][^>]*\sstyle="/);
    expect(page).toMatch(/style-src 'sha256-[^']+' 'sha256-[^']+'/);
    expect(page).toContain("font-src data:");
    expect(dataOf(html).quizzes[0]?.hasMath).toBe(true);
  });

  it("gives the same bytes twice", async () => {
    const highlight = await loadHighlighter(languagesUsed(mathsAndCode.quiz, mathsAndCode.sheets));
    const once = buildPage([mathsAndCode], { ...plainOptions, math: katexTools(), highlight });
    const twice = buildPage([mathsAndCode], { ...plainOptions, math: katexTools(), highlight });
    expect(twice).toBe(once);
  });

  it("keeps a maths span as its TeX in an item's label, and as KaTeX's HTML in its html", () => {
    const page = pageQuizOf(mathsAndCode, undefined, { math: tools.start().render });
    const g1 = page.sections.flatMap((s) => s.questions).find((q) => q.id === "g1");
    if (g1?.type !== "matching") throw new Error("fixture");
    expect(g1.rights.map((r) => r.label).sort()).toEqual(["$2x$", "$\\cos x$", "$e^x$"].sort());
    expect(g1.rights.every((r) => r.html.includes('class="katex"'))).toBe(true);
    expect(g1.lefts.every((l) => l.includes('class="katex"'))).toBe(true);
  });

  it("shows a span KaTeX cannot render as its source instead of stopping the build", () => {
    const md = createRenderer([], {
      math: () => {
        throw new Error("bad");
      },
    });
    expect(md.inline("a $\\oops$ b")).toBe('a <span class="math">$\\oops$</span> b');
  });

  it("renders display maths in a block", () => {
    const md = createRenderer([], { math: tools.start().render });
    expect(md.block("$$x^2$$")).toMatch(/^<div class="math"><span class="katex-display">/);
  });
});

describe("materials sheets in the page data", () => {
  it("are rendered in the order listed, with maths and highlighted code", async () => {
    const highlight = await loadHighlighter(languagesUsed(mathsAndCode.quiz, mathsAndCode.sheets));
    const page = pageQuizOf(mathsAndCode, undefined, { math: katexTools().start().render, highlight });
    expect(page.materials?.map((m) => m.name)).toEqual(["Formulas"]);
    const html = page.materials?.[0]?.html ?? "";
    expect(html).toContain("<h1>Formulas</h1>");
    expect(html).toContain('class="katex"');
    expect(html).toContain('<pre class="fm-hl"><code class="language-rust">');
  });

  it("are absent for a quiz without sheets", () => {
    expect("materials" in pageQuizOf(plain)).toBe(false);
  });
});

describe("code highlighting", () => {
  it("colours tokens with classes that name a --fm-code- variable, and holds no colour literal", async () => {
    const highlight = (await loadHighlighter(["python"])) as Highlight;
    const md = createRenderer([], { highlight });
    const html = md.block("```python\ndef f(x):\n    return 'a' + x  # <b>\n```");
    expect(html).toMatch(/^<pre class="fm-hl"><code class="language-python">/);
    expect(html).toContain('<span class="fm-tk-keyword">def</span>');
    expect(html).toContain("&lt;b&gt;");
    expect(html).not.toMatch(/style=|#[0-9a-f]{3,6}\b|rgb\(/);
  });

  it("leaves a fence with no language, or one that is not known, as plain code", async () => {
    const highlight = (await loadHighlighter(["python"])) as Highlight;
    const md = createRenderer([], { highlight });
    expect(md.block("```\nx = 1\n```")).toBe("<pre><code>x = 1\n</code></pre>\n");
    expect(md.block("```text\nx = 1\n```")).toBe('<pre><code class="language-text">x = 1\n</code></pre>\n');
    expect(md.block("```rust\nlet x = 1;\n```")).toBe('<pre><code class="language-rust">let x = 1;\n</code></pre>\n');
  });

  it("has a grammar for every language the quality rule names", async () => {
    const highlight = (await loadHighlighter(KNOWN_LANGUAGES)) as Highlight;
    for (const lang of KNOWN_LANGUAGES) {
      const html = highlight("x = 1\n", lang);
      expect(html, lang).toContain(`<code class="language-${lang}">`);
    }
  }, 60_000);

  it("finds the languages of fences in prompts, explanations, sheets and code questions", () => {
    const found = languagesUsed(mathsAndCode.quiz, mathsAndCode.sheets);
    expect([...found].sort()).toEqual(["python", "rust"]);
  });
});

describe("blanks inside highlighted code", () => {
  const body = [
    "## Fill in. {type=blanks id=q}",
    "",
    "```python",
    "def f(x):",
    "    return x [[**]] 2 + [[=3±0.5]]",
    "```",
    "",
    "Then `a[[0]]` is code, and [[plain]] is a blank.",
    "",
    "```rust",
    "let [[mut]] y = [[5]];",
    "```",
  ].join("\n");

  it("get their input at the right place, and parser and page count the same", async () => {
    const result = parse(`---\ntitle: T\n---\n\n${body}\n`, "t.md");
    expect(result.issues).toEqual([]);
    const q = result.quiz?.sections[0]?.questions[0];
    if (q?.type !== "blanks") throw new Error("not a blanks question");
    expect(q.blanks).toHaveLength(5);
    const highlight = await loadHighlighter(["python", "rust"]);
    const md = createRenderer([], { highlight });
    const html = md.blanks(
      q.prompt,
      q.blanks.map((b) => b.kind),
      (n) => `blank ${n}`,
    );
    expect([...html.matchAll(/data-blank="(\d+)"/g)].map((m) => Number(m[1]))).toEqual([0, 1, 2, 3, 4]);
    expect(html).toContain('<pre class="fm-hl"><code class="language-python">');
    expect(html).toMatch(/<span class="fm-tk-keyword">return<\/span> x <input [^>]*data-blank="0"/);
    expect(html).toMatch(/let<[/]span> <input [^>]*data-blank="3"[^>]*> y/);
    expect(html).not.toContain("FMBLANK");
    expect(html).not.toMatch(/[]/);
  });
});

describe("KaTeX fonts by use", () => {
  /** The faces the stylesheet of a session that rendered these spans declares, as `Family weight style`. */
  const facesOf = (...spans: string[]): string[] => {
    const session = katexTools().start();
    for (const tex of spans) session.render(tex, false);
    return [...session.css().matchAll(/@font-face\{[^}]*\}/g)].map((m) => {
      const rule = m[0];
      const family = /font-family:"?([^";]+)"?/.exec(rule)?.[1];
      return `${family} ${/font-weight:(\d+)/.exec(rule)?.[1]} ${/font-style:(\w+)/.exec(rule)?.[1]}`;
    });
  };

  it("plain maths embeds the main fonts and not the script, fraktur or typewriter ones", () => {
    const faces = facesOf("x^2 + \\frac{a}{b} = \\sqrt{c}");
    expect(faces).toContain("KaTeX_Main 400 normal");
    expect(faces).toContain("KaTeX_Math 400 italic");
    for (const absent of ["KaTeX_Script", "KaTeX_Fraktur", "KaTeX_Typewriter", "KaTeX_Caligraphic", "KaTeX_AMS"]) {
      expect(faces.filter((f) => f.startsWith(absent))).toEqual([]);
    }
    expect(faces.length).toBeLessThan(6);
  });

  it("\\mathcal brings Caligraphic in, \\mathbb the AMS font, \\mathbf bold Main, and nothing else changes", () => {
    expect(facesOf("\\mathcal{L}")).toContain("KaTeX_Caligraphic 400 normal");
    expect(facesOf("x")).not.toContain("KaTeX_Caligraphic 400 normal");
    expect(facesOf("\\mathbb{R}")).toContain("KaTeX_AMS 400 normal");
    expect(facesOf("\\mathbf{v}")).toContain("KaTeX_Main 700 normal");
    expect(facesOf("\\mathfrak{g}", "\\mathscr{A}", "\\mathtt{t}")).toEqual(
      expect.arrayContaining(["KaTeX_Fraktur 400 normal", "KaTeX_Script 400 normal", "KaTeX_Typewriter 400 normal"]),
    );
    expect(facesOf("\\textbf{bold}")).toContain("KaTeX_Main 700 normal");
    expect(facesOf("\\left( \\sum_{i} x \\right)").some((f) => f.startsWith("KaTeX_Size"))).toBe(true);
  });

  it("is only WOFF2 data URIs, and the rules for the styles stay", () => {
    const session = katexTools().start();
    session.render("\\mathcal{L} + \\frac{1}{2}", false);
    const out = session.css();
    expect(out).not.toMatch(/url\(fonts\//);
    expect(out).not.toContain('format("woff")');
    expect(out).toContain(".katex .fm-s0{");
  });
});
