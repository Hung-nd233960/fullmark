// Rewrites the expected files of test/golden. Review the diff before committing it: it is the contract.
import { spawnSync } from "node:child_process";

const r = spawnSync("npx", ["vitest", "run", "test/golden"], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, FULLMARK_GOLDEN_UPDATE: "1" },
});
process.exit(r.status ?? 1);
