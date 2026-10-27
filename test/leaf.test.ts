import { describe, expect, it } from "vitest";
import { normaliseText, quizHash, sha256Hex } from "../src/core/hash";
import { isFraction, readDuration, readNumber } from "../src/core/number";
import { regexProblem } from "../src/core/regex";
import { ID_FORMAT, slug } from "../src/core/slug";

describe("slug", () => {
  it("lower-cases, strips accents and joins words with single hyphens", () => {
    expect(slug("Part 2: Reading")).toBe("part-2-reading");
    expect(slug("  --Signals & Systems!  ")).toBe("signals-systems");
  });

  it("maps đ and Đ to d, which have no decomposition (TECHNICAL_DESIGN.md, section 9)", () => {
    expect(slug("Đạo hàm")).toBe("dao-ham");
    expect(slug("đường đi")).toBe("duong-di");
  });

  it("is the same for composed and decomposed text", () => {
    expect(slug("Ệ ở".normalize("NFD"))).toBe(slug("Ệ ở".normalize("NFC")));
    expect(slug("Ệ ở")).toBe("e-o");
  });

  it("can come out empty", () => {
    expect(slug("日本語")).toBe("");
  });
});

describe("id format", () => {
  it("is a slug starting with a letter, at most 64 characters", () => {
    for (const ok of ["q", "q-k7m2qx", "roc-causal", "a".repeat(64)]) expect(ID_FORMAT.test(ok), ok).toBe(true);
    for (const bad of ["", "1a", "Q_1", "-a", "a b", "a".repeat(65)]) expect(ID_FORMAT.test(bad), bad).toBe(false);
  });
});

describe("readNumber", () => {
  it("reads integers, decimals, exponents and fractions", () => {
    expect(readNumber("-2")).toBe(-2);
    expect(readNumber("0.5")).toBe(0.5);
    expect(readNumber(".5")).toBe(0.5);
    expect(readNumber("1e-3")).toBe(0.001);
    expect(readNumber("1/3")).toBeCloseTo(0.3333333, 6);
    expect(readNumber(" 7 ")).toBe(7);
  });

  it("refuses words, empty text, a zero denominator and thousands separators", () => {
    for (const bad of ["one", "", "1/0", "1,000", "1.000,5", "0x10", "Infinity", "1/2/3"]) {
      expect(readNumber(bad), bad).toBeNull();
    }
  });

  it("reads a decimal comma only when asked, and never a thousands separator", () => {
    expect(readNumber("2,5")).toBeNull();
    expect(readNumber("2,5", { decimalComma: true })).toBe(2.5);
    expect(readNumber("1,000", { decimalComma: true })).toBe(1);
  });

  it("knows a fraction", () => {
    expect(isFraction("1/3")).toBe(true);
    expect(isFraction("0.333")).toBe(false);
  });
});

describe("readDuration", () => {
  it("reads 90s, 45m and 1h30m as seconds", () => {
    expect(readDuration("90s")).toBe(90);
    expect(readDuration("45m")).toBe(2700);
    expect(readDuration("1h30m")).toBe(5400);
  });

  it("refuses anything else", () => {
    for (const bad of ["soon", "", "0m", "45", "m", "1.5h", "30m1h"]) expect(readDuration(bad), bad).toBeNull();
  });
});

describe("regexProblem", () => {
  it("accepts ordinary patterns", () => {
    expect(regexProblem("^chain( rule)?$")).toBeNull();
    expect(regexProblem("[(?<=]x")).toBeNull();
  });

  it("refuses broken patterns, lookbehind, inline flags and Python named groups", () => {
    expect(regexProblem("(abc")).not.toBeNull();
    expect(regexProblem("[")).not.toBeNull();
    expect(regexProblem("(?<=a)b")).toMatch(/lookbehind/);
    expect(regexProblem("(?<!a)b")).toMatch(/lookbehind/);
    expect(regexProblem("(?i)abc")).toMatch(/inline flags/);
    expect(regexProblem("(?i:abc)")).toMatch(/inline flags/);
    expect(regexProblem("(?P<n>a)")).not.toBeNull();
  });
});

describe("hashing", () => {
  it("normalises BOM, line endings, NFC and trailing whitespace", () => {
    const plain = "a\nb\n";
    expect(normaliseText("﻿a  \r\nb\t\r\n\r\n")).toBe(plain);
    expect(normaliseText("a\rb")).toBe(plain);
    expect(normaliseText("é\n")).toBe(normaliseText("é\n"));
    expect(normaliseText("")).toBe("");
  });

  it("hashes as lowercase hex SHA-256", () => {
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("quiz hash: same text in any encoding, but any asset byte changes it", () => {
    const bytes = (...n: number[]) => new Uint8Array(n);
    const a = quizHash("x\ny\n", [{ path: "assets/a.png", bytes: bytes(1, 2, 3) }]);
    expect(quizHash("﻿x  \r\ny\r\n", [{ path: "assets/a.png", bytes: bytes(1, 2, 3) }])).toBe(a);
    expect(quizHash("x\ny\n", [{ path: "assets/a.png", bytes: bytes(1, 2, 4) }])).not.toBe(a);
    expect(quizHash("x\ny\n", [{ path: "assets/b.png", bytes: bytes(1, 2, 3) }])).not.toBe(a);
    expect(quizHash("x\ny\n", [])).not.toBe(a);
  });

  it("quiz hash does not depend on the order assets are given in", () => {
    const one = { path: "a.png", bytes: new Uint8Array([1]) };
    const two = { path: "b.png", bytes: new Uint8Array([2]) };
    expect(quizHash("t", [one, two])).toBe(quizHash("t", [two, one]));
  });
});
