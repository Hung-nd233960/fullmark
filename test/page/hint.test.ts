import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { setup } from "../helpers/page";

const fixture = (name: string) => readFileSync(resolve(import.meta.dirname, "..", "fixtures", "page", name), "utf8");

const articleOf = (html: string, id: string): string => {
  const from = html.lastIndexOf("<article", html.indexOf(`data-qid="${id}"`));
  return html.slice(from, html.indexOf("</article>", from) + 10);
};

describe("the hint button and the explanation label", () => {
  it("reads 'Hint' while closed, with aria-expanded false and no icon", () => {
    const s = setup(fixture("types.md"));
    s.store.start(s.id, { seed: "seed0001" });
    const card = articleOf(s.html(), "b1");
    const button = card.slice(card.indexOf('<button type="button" class="fm-button fm-hint-toggle"'));
    const tag = button.slice(0, button.indexOf("</button>"));
    expect(tag).toContain('aria-expanded="false"');
    expect(tag).toMatch(/>Hint$/);
    expect(tag).not.toContain("<svg");
    expect(card).not.toContain("Show hint");
  });

  it("says 'Gợi ý' on a vi page", () => {
    const vi = fixture("types.md").replace("---\n", "---\nlang: vi\nui_lang: vi\n");
    const s = setup(vi);
    s.store.start(s.id, { seed: "seed0001" });
    expect(articleOf(s.html(), "b1")).toMatch(/fm-hint-toggle[^>]*>Gợi ý<\/button>/);
  });

  it("shows the explanation's label as the word alone", () => {
    const s = setup(fixture("instant.md"));
    s.store.start(s.id, { seed: "seed0001" });
    s.store.dispatch(s.id, { type: "answer", question: "i1", answer: { choice: 0 } });
    s.store.dispatch(s.id, { type: "check", question: "i1" });
    expect(articleOf(s.html(), "i1")).toContain('<strong class="fm-explanation-label">Explanation</strong>');
  });
});
