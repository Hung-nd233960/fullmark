import { describe, expect, it } from "vitest";
import { findCases, readExpected, runCase, view, writeExpected } from "./runner";

// `npm run golden:update` sets this and rewrites the expected files; a plain run only compares.
const UPDATE = process.env.FULLMARK_GOLDEN_UPDATE === "1";

describe("golden files", () => {
  const cases = findCases();

  it("has cases", () => {
    expect(cases.length).toBeGreaterThan(0);
  });

  for (const c of cases) {
    it.concurrent(
      c.name,
      async () => {
        const [first, second] = await Promise.all([runCase(c), runCase(c)]);
        // determinism: the same bytes from a second run in a fresh folder
        const a = JSON.stringify(view(first));
        const b = JSON.stringify(view(second));
        if (a !== b) {
          let at = 0;
          while (a[at] === b[at]) at++;
          expect.fail(`two runs of the same case differ at ${at}: ${a.slice(at - 80, at + 80)} / ${b.slice(at - 80, at + 80)}`);
        }
        if (UPDATE) {
          writeExpected(c, first);
          return;
        }
        expect(view(first)).toEqual(view(readExpected(c)));
      },
      // two CLI starts per case: about 3 s idle, but 70 s was seen when 500 cases and the other test files share 8 cores
      180_000,
    );
  }
});
