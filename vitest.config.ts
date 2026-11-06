import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    globalSetup: ["test/global-setup.ts"],
    // Some tests are CPU-bound (bundling, building every example) and slow down under the full parallel run on a
    // 4-core machine, well past the 5 s default though each is quick alone. A test that waits on a real timer is
    // still a bug (STEP3.md, G51); a test that needs more than this names its own timeout, with the reason.
    testTimeout: 30_000,
  },
});
