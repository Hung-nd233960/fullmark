import { execSync } from "node:child_process";
import { resolve } from "node:path";

/** Builds the CLI bundle once, before any test file runs, so the tests that run it see the current code. */
export default function setup(): void {
  execSync("npm run build", { cwd: resolve(import.meta.dirname, ".."), stdio: "ignore" });
}
