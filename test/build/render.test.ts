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
