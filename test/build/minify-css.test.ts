import { describe, expect, it } from "vitest";
import { minifyCss } from "../../scripts/minify-css.mjs";

describe("the page CSS minifier", () => {
  it("keeps the white space before a colon, so a descendant stays a descendant", () => {
    expect(minifyCss(".a :is(.b) { color: red }")).toBe(".a :is(.b){color:red}");
    expect(minifyCss(".a ::before { x: y }")).toBe(".a ::before{x:y}");
  });

  it("still drops the white space after a colon, around braces, commas and semicolons", () => {
    expect(minifyCss("p { color : red ; margin: 0 }")).toBe("p{color :red;margin:0}");
    expect(minifyCss("a , b > c { /* gone */ top: 1px; }")).toBe("a,b>c{top:1px}");
  });

  it("does not touch a pseudo-class written without a space", () => {
    expect(minifyCss("a:hover { top: 0 }")).toBe("a:hover{top:0}");
  });
});
