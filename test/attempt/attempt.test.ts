import { describe, expect, it } from "vitest";
import { ANSWER_SHAPES, answerProblem, readAnswer } from "../../src/core/attempt/answers";
import { attemptOf, parseResults, RESULTS_VERSION, resultsOf } from "../../src/core/attempt/results";
import { type Attempt, emptyState } from "../../src/core/attempt/schema";
import { QUESTION_TYPES } from "../../src/core/ir";

const HASH = "a".repeat(64);

const attempt = (state = emptyState()): Attempt => ({
  quizHash: HASH,
  plan: { source: "full", questions: ["q1", "q2"] },
  state: { ...state, answers: { q1: { choice: 1 }, q2: null }, startedAt: "2026-10-23T16:02:00", timeUsed: 61 },
  phase: "submitted",
});

const text = (a: Attempt, extra: Record<string, unknown> = {}) => JSON.stringify({ ...resultsOf(a), ...extra });

describe("results-v2", () => {
  it("round-trips an attempt", () => {
    const read = parseResults(text(attempt()));
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(attemptOf(read.results)).toEqual(attempt());
    expect(read.results.version).toBe(RESULTS_VERSION);
  });

  it("ignores unknown keys, and accepts the reserved bundle key", () => {
    const read = parseResults(text(attempt(), { somethingNew: 1, bundle: { hash: "h", sitting: "s" } }));
    expect(read.ok).toBe(true);
    if (read.ok) expect(read.results.bundle).toEqual({ hash: "h", sitting: "s" });
    expect(parseResults(text(attempt(), { bundle: undefined })).ok).toBe(true);
  });

  it("keeps the whole file as parsed, unknown keys included, for results_hash", () => {
    const read = parseResults(text(attempt(), { somethingNew: [1, 2] }));
    expect(read.ok && (read.json as Record<string, unknown>).somethingNew).toEqual([1, 2]);
  });

  it("reads a file with a BOM", () => {
    expect(parseResults(`﻿${text(attempt())}`).ok).toBe(true);
  });

  it("requires every known key", () => {
    for (const key of ["quizHash", "plan", "state", "phase"]) {
      const file = JSON.parse(text(attempt())) as Record<string, unknown>;
      delete file[key];
      const read = parseResults(JSON.stringify(file));
      expect(read.ok, key).toBe(false);
      if (!read.ok) expect(read.message, key).toContain(key);
    }
    for (const key of ["answers", "startedAt", "submittedAt", "timeUsed", "sectionTime", "flagged", "timedOut"]) {
      const file = JSON.parse(text(attempt())) as { state: Record<string, unknown> };
      delete file.state[key];
      const read = parseResults(JSON.stringify(file));
      expect(read.ok, key).toBe(false);
      if (!read.ok) expect(read.message, key).toContain(`state.${key}`);
    }
  });

  it("refuses a 0.x file (version 1) with a pointer to the move-in script", () => {
    const read = parseResults(JSON.stringify({ format: "fullmark-results", version: 1, quiz: {}, responses: [] }));
    expect(read.ok).toBe(false);
    if (!read.ok) {
      expect(read.message).toContain("0.x results file");
      expect(read.message).toContain("move-in script");
    }
  });

  it("refuses other files in plain words", () => {
    const messages = [
      "not json",
      "[]",
      JSON.stringify({ format: "something-else", version: 2 }),
      JSON.stringify({ format: "fullmark-results", version: 3 }),
      JSON.stringify({ format: "fullmark-results", version: 2 }),
      JSON.stringify({ version: 2 }),
    ].map((t) => {
      const read = parseResults(t);
      return read.ok ? "" : read.message;
    });
    expect(messages.every((m) => m.length > 10)).toBe(true);
    expect(messages[3]).toContain("unsupported results version 3");
  });

  it("checks the date format, the hash and the phase", () => {
    const bad = (patch: (f: { quizHash: string; phase: string; state: Record<string, unknown> }) => void) => {
      const file = JSON.parse(text(attempt())) as { quizHash: string; phase: string; state: Record<string, unknown> };
      patch(file);
      return parseResults(JSON.stringify(file)).ok;
    };
    expect(bad((f) => (f.state.startedAt = "yesterday"))).toBe(false);
    expect(bad((f) => (f.state.startedAt = "2026-10-23T16:02:00.5+07:00"))).toBe(true);
    expect(bad((f) => (f.state.submittedAt = "2026-10-23T16:02:00Z"))).toBe(true);
    expect(bad((f) => (f.quizHash = "abc"))).toBe(false);
    expect(bad((f) => (f.phase = "done"))).toBe(false);
  });
});

describe("answer shapes", () => {
  it("has one shape for every question type", () => {
    expect(Object.keys(ANSWER_SHAPES).sort()).toEqual([...QUESTION_TYPES].sort());
  });

  it("reads each shape, ignoring unknown keys such as 0.x's word_count", () => {
    expect(readAnswer("essay", { text: "hi", word_count: 1 })).toEqual({ text: "hi" });
    expect(readAnswer("single", { choice: 0, inputs: { "0": "x" } })).toEqual({ choice: 0, inputs: { "0": "x" } });
    expect(readAnswer("matching", { pairs: [0, null, 2] })).toEqual({ pairs: [0, null, 2] });
    expect(readAnswer("scale", { value: 0 })).toEqual({ value: 0 });
    expect(readAnswer("truefalse", { value: null })).toEqual({ value: null });
    expect(readAnswer("code", { code: "x", language: "rust" })).toEqual({ code: "x", language: "rust" });
  });

  it("returns null for no answer, and for one of the wrong shape", () => {
    expect(readAnswer("single", null)).toBeNull();
    expect(readAnswer("single", undefined)).toBeNull();
    expect(readAnswer("single", { choice: "a" })).toBeNull();
    expect(readAnswer("multi", { choices: [-1] })).toBeNull();
    expect(readAnswer("ordering", { order: [0.5] })).toBeNull();
  });

  it("says what is wrong with an answer", () => {
    expect(answerProblem("single", { choice: 0 })).toBeNull();
    expect(answerProblem("single", null)).toBeNull();
    expect(answerProblem("single", { choice: "x" })).toContain("`choice` does not fit a single question");
    expect(answerProblem("numeric", { raw: 5 })).toContain("`raw`");
  });

  it("takes an empty answer for every type", () => {
    for (const type of QUESTION_TYPES) expect(answerProblem(type, {}), type).toBeNull();
  });
});
