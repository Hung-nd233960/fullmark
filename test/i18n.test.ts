import { describe, expect, it } from "vitest";
import { en, type Messages, vi } from "../src/core/i18n";

describe("message catalogs", () => {
  it("vi has exactly the keys of en (a missing key is a compile error; this checks at run time too)", () => {
    const viMessages: Messages = vi;
    expect(Object.keys(viMessages).sort()).toEqual(Object.keys(en).sort());
  });
});
