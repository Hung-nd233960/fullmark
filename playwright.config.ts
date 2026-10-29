import { defineConfig } from "@playwright/test";

/**
 * Browser tests (TECHNICAL_DESIGN.md, section 11): Chromium and Firefox. Firefox isolates `file://` storage per file
 * (foundation 2), which is what resume has to work with; a test that cannot run in one of them says why in a `test.skip`.
 */
export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  reporter: [["list"]],
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    // axe is slow in Firefox under parallel load: it gets 60 s a test; no retries
    { name: "firefox", timeout: 60_000, use: { browserName: "firefox" } },
  ],
});
