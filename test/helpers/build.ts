import type { BuildOptions } from "../../src/cli/build";

/** Build options for tests: plain, pinned time, nothing opened. */
export const base: BuildOptions = {
  profile: null,
  config: null,
  strict: false,
  output: null,
  builtAt: "2026-10-28T10:00:00+07:00",
  fonts: null,
  uiLang: null,
  plain: true,
  json: false,
  open: false,
  buildFile: null,
  print: false,
  seed: null,
  answerSheet: false,
  answers: null,
  materials: null,
  watch: false,
  serve: false,
  port: null,
  version: "1.0.0-test",
};
