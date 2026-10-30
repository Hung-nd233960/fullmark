import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { setup } from "../helpers/page";

const types = readFileSync(resolve(import.meta.dirname, "..", "fixtures", "page", "types.md"), "utf8");

/** The article of a question, from the page's HTML. */
const articleOf = (html: string, id: string): string => {
  const from = html.lastIndexOf("<article", html.indexOf(`data-qid="${id}"`));
  return html.slice(from, html.indexOf("</article>", from) + 10);
};

describe("one answer or several", () => {
  const started = () => {
    const s = setup(types);
    s.store.start(s.id, { seed: "seed0001" });
    return s;
  };

  it("tells a single question's header 'Choose one' and a multi's 'Choose all that apply'", () => {
    const html = started().html();
    expect(articleOf(html, "s1")).toContain('<span class="fm-kind">Choose one</span>');
    expect(articleOf(html, "m1")).toContain('<span class="fm-kind">Choose all that apply</span>');
  });

  it("gives true/false and the other types no tag", () => {
    const html = started().html();
    for (const id of ["t1", "n1", "h1", "b1", "f1", "o1", "g1", "e1", "k1"]) {
      expect(articleOf(html, id), id).not.toContain("fm-kind");
    }
  });

  it("says it in Vietnamese on a vi page", () => {
    const vi = types.replace("---\n", "---\nlang: vi\nui_lang: vi\n");
    const s = setup(vi);
    s.store.start(s.id, { seed: "seed0001" });
    const html = s.html();
    expect(articleOf(html, "s1")).toContain("Chọn một đáp án");
    expect(articleOf(html, "m1")).toContain("Chọn tất cả đáp án đúng");
  });

  it("ends a picked multi row with a tick while answering, and no other row", () => {
    const s = started();
    expect(articleOf(s.html(), "m1")).not.toContain("fm-tick");
    s.store.dispatch(s.id, { type: "answer", question: "m1", answer: { choices: [0] } });
    s.store.dispatch(s.id, { type: "answer", question: "s1", answer: { choice: 0 } });
    const html = s.html();
    expect(articleOf(html, "m1").match(/fm-tick/g)?.length).toBe(1);
    expect(articleOf(html, "s1")).not.toContain("fm-tick");
    s.store.submit(s.id);
    expect(articleOf(s.html(), "m1")).not.toContain("fm-tick");
  });
});
