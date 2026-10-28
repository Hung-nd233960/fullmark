import { defineConfig } from "@playwright/test";

/** Browser tests (TECHNICAL_DESIGN.md, section 11). Chromium only for now; Firefox joins in slice 2d. */
export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  reporter: [["list"]],
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
