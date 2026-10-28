import { describe, expect, it } from "vitest";
import { createRenderer } from "../../src/build/render";

const png = new Uint8Array([137, 80, 78, 71]);
const assets = [
  { path: "img/heart.png", bytes: png },
  { path: "track.mp3", bytes: new Uint8Array([1, 2, 3]) },
];
const md = createRenderer(assets);

describe("markdown for the page", () => {
  it("embeds an image as a data: URI, with its width", () => {
    const html = md.block("![A heart](img/heart.png){width=300}");
    expect(html).toContain('src="data:image/png;base64,iVBORw==');
    expect(html).toContain('alt="A heart"');
    expect(html).toContain('width="300"');
    expect(html).not.toContain("{width");
  });

  it("finds an asset through ./ and ../", () => {
    expect(md.inline("![x](./img/../img/heart.png)")).toContain("data:image/png");
  });

  it("renders audio as a player", () => {
    expect(md.block("![Track 1](track.mp3)")).toContain('<audio controls src="data:audio/mpeg;base64,AQID"');
  });

  it("never lets raw HTML through", () => {
    expect(md.block("<script>alert(1)</script>")).not.toContain("<script>");
  });

  it("keeps maths as escaped text until the maths slice", () => {
    expect(md.inline("$a < b$")).toBe('<span class="math">$a &lt; b$</span>');
  });
});

describe("blanks: the parser and the page agree", () => {
  const body = [
    "## r0 [[b0]] {type=blanks id=q}",
    "",
    "r1 [[b1]] in a paragraph.",
    "",
    "- r2 [[b2]] in a list",
    "  - r3 [[b3]] nested",
    "",
    "> r4 [[b4]] in a quote",
    "",
    "| h | h |",
    "|---|---|",
    "| r5 [[b5\\|c5]] | r6 [[=1±0.5]] |",
    "",
    "```",
    "r7 [[b7]] in fenced code",
    "```",
    "",
    "    r8 [[b8]] in indented code",
  ].join("\n");

  it("find the same blanks in the same order", async () => {
    const { parse } = await import("../../src/core/parse");
    const result = parse(`---\ntitle: T\n---\n\n${body}\n`, "t.md");
    expect(result.issues.map((i) => `${i.rule}@${i.line}`)).toEqual([]);
    const q = result.quiz?.sections[0]?.questions[0];
    if (q?.type !== "blanks") throw new Error("not a blanks question");
    expect(q.blanks).toHaveLength(9);
    const html = md.blanks(
      q.prompt,
      q.blanks.map((b) => b.kind),
      (n) => `blank ${n}`,
    );
    const inputs = [...html.matchAll(/data-blank="(\d+)"/g)].map((m) => Number(m[1]));
    expect(inputs).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("shows \\[[ as [[ without the backslash", () => {
    const html = md.blanks("A \\[[x]] and [[y]]", ["text"], (n) => `blank ${n}`);
    expect(html).toContain("A [[x]] and ");
    expect(html.match(/<input/g)).toHaveLength(1);
  });
});
