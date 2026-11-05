import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { sha256 } from "@noble/hashes/sha2.js";
import { utf8ToBytes } from "@noble/hashes/utils.js";
import { describe, expect, it } from "vitest";
import { buildReviewForm, earlierVerdicts, type ReviewFormOptions } from "../../src/build/review-form";
import { quizHash } from "../../src/core/hash";
import { reviewEn, reviewVi } from "../../src/core/i18n/review";
import { toBase64 } from "../../src/core/keyblob";
import { parse } from "../../src/core/parse";
import type { Review } from "../../src/core/review/schema";
import type { PageQuestion } from "../../src/page/data";
import type { ReviewData } from "../../src/review/data";

/**
 * The page `quiz review` builds in memory (foundation 9: the form is its own bundle, and a shared page carries none of
 * it) and the bundle it carries. The data holds the quiz as the form shows it (G55): source order, every question of
 * a bank, every rubric.
 */
const dist = resolve(import.meta.dirname, "..", "..", "dist");
const script = readFileSync(join(dist, "review.js"), "utf8");

const SOURCE = `---
title: Everything
id: every
shuffle_choices: true
---

# Part A {id=part-a}

## Order these {type=ordering id=order-it}

1. first
2. second
3. third

## Match them {type=matching id=match-it}

- a :: 1
- b :: 2
- :: spare

## Explain {type=essay id=explain-it}

\`\`\`answer
rubric:
  - Names the cause (2)
  - Gives an example (1)
show_rubric: false
\`\`\`

# Part B {id=part-b pick=1}

## Bank one {type=single id=bank-one}

- [x] yes
- [ ] no

## Bank two {type=single id=bank-two}

- [ ] yes
- [x] no
`;

function options(source = SOURCE, extra: Partial<ReviewFormOptions> = {}): ReviewFormOptions {
  const { quiz, issues } = parse(source, "quiz.md");
  if (quiz === null) throw new Error(`the fixture does not parse: ${JSON.stringify(issues)}`);
  return {
    quiz,
    hash: quizHash(source, []),
    assets: [],
    review: null,
    out: "review.json",
    check: "quiz check quiz.md --review review.json",
    script,
    css: "body{}",
    reviewCss: "main{}",
    builtAt: "2026-11-03T09:00:00+07:00",
    version: "1.0.0-test",
    ...extra,
  };
}
const dataOf = (html: string): ReviewData =>
  JSON.parse(/id="fm-data">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? "") as ReviewData;

describe("the review form's page", () => {
  const html = buildReviewForm(options());

  it("is byte for byte the same for the same input", () => {
    expect(buildReviewForm(options())).toBe(html);
  });

  it("allows its one script by hash, its styles by hash, and the form's own submit, and nothing else", () => {
    const csp = /Content-Security-Policy" content="([^"]*)"/.exec(html)?.[1] ?? "";
    expect(csp).toContain(`script-src 'sha256-${toBase64(sha256(utf8ToBytes(script)))}'`);
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).toContain("form-action 'none'");
    const styles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1] as string);
    for (const style of styles) expect(csp).toContain(`'sha256-${toBase64(sha256(utf8ToBytes(style)))}'`);
    // one script that runs, the data block that does not
    expect([...html.matchAll(/<script(?![^>]*application\/json)[^>]*>/g)]).toHaveLength(1);
    expect(html).toContain('<div id="fm-root"></div>');
  });

  it("carries the page's styles and the form's, and the quiz's language", () => {
    expect(html).toContain("body{}");
    expect(html).toContain("main{}");
    expect(html).toContain('<html lang="en">');
    expect(html).toContain("<title>Everything</title>");
  });

  it("carries the materials sheets, rendered as the page renders them, only when the quiz has some (G39)", () => {
    expect(dataOf(html).page.quizzes[0].materials).toBeUndefined();
    const source = ["# Rules", "", "Some **bold** words.", ""].join("\n");
    const sheets = [{ path: "a.md", name: "Rules", source }];
    const quiz = dataOf(buildReviewForm(options(SOURCE, { sheets }))).page.quizzes[0];
    expect(quiz.materials?.map((m) => m.name)).toEqual(["Rules"]);
    expect(quiz.materials?.[0]?.html).toContain("<strong>bold</strong>");
  });

  it("refuses a script that would end the page's script", () => {
    expect(() => buildReviewForm(options(SOURCE, { script: "x</script><script>y" }))).toThrow(/closing script tag/);
  });

  it("holds every question of the quiz in source order, a bank's whole pool included", () => {
    const quiz = dataOf(html).page.quizzes[0];
    expect(quiz.sections.flatMap((s) => s.questions.map((q) => q.id))).toEqual([
      "order-it",
      "match-it",
      "explain-it",
      "bank-one",
      "bank-two",
    ]);
  });

  it("lists ordering and matching in source order, not in an order drawn from the plan", () => {
    const questions = dataOf(html).page.quizzes[0].sections.flatMap((s) => s.questions);
    const order = questions.find((q) => q.id === "order-it") as Extract<PageQuestion, { type: "ordering" }>;
    expect(order.items.map((i) => i.label)).toEqual(["first", "second", "third"]);
    const match = questions.find((q) => q.id === "match-it") as Extract<PageQuestion, { type: "matching" }>;
    expect(match.rights.map((r) => r.label)).toEqual(["1", "2", "spare"]);
  });

  it("shows every rubric, whatever show_rubric says", () => {
    const questions = dataOf(html).page.quizzes[0].sections.flatMap((s) => s.questions);
    const essay = questions.find((q) => q.id === "explain-it") as Extract<PageQuestion, { type: "essay" }>;
    expect(essay.rubric?.map((c) => c.html)).toEqual(["Names the cause (2)", "Gives an example (1)"]);
    // the quiz as parsed is untouched: the page a learner gets still hides it
    const { quiz } = parse(SOURCE, "quiz.md");
    const original = quiz?.sections[0]?.questions.find((q) => q.id === "explain-it");
    expect(original && "showRubric" in original && original.showRubric).toBe(false);
  });

  it("carries the two names the saved card shows", () => {
    const data = dataOf(html);
    expect(data.out).toBe("review.json");
    expect(data.check).toBe("quiz check quiz.md --review review.json");
    expect(data.earlier).toEqual({});
  });

  it("is built with no page runtime and no server code: only the form's script", () => {
    const runtime = readFileSync(join(dist, "page.js"), "utf8");
    expect(html).not.toContain(runtime.slice(0, 200));
    expect(html).not.toContain('id="fm-licences"');
  });
});

describe("the earlier verdicts (G53)", () => {
  const { quiz } = parse(SOURCE, "quiz.md");
  if (quiz === null) throw new Error("no quiz");
  const questions = quiz.sections.flatMap((s) => s.questions);
  const hashOf = (id: string) => questions.find((q) => q.id === id)?.hash as string;
  const review = (entries: Review["questions"]): Review => ({
    format: "fullmark-review",
    version: 2,
    quizId: "every",
    quizHash: "a".repeat(64),
    reviewedAt: "2026-10-28T09:00:00+07:00",
    questions: entries,
  });

  it("are those whose question hash is unchanged; a changed or a gone question starts not judged", () => {
    const earlier = earlierVerdicts(
      quiz,
      review({
        "order-it": { verdict: "fix", reasons: ["unclear"], note: "x", hash: hashOf("order-it"), source: "s" },
        "match-it": { verdict: "keep", reasons: [], note: "", hash: "b".repeat(64) },
        "explain-it": { verdict: "keep", reasons: [], note: "", hash: hashOf("explain-it"), assumed: true },
        gone: { verdict: "keep", reasons: [], note: "", hash: "c".repeat(64) },
      }),
    );
    expect(earlier).toEqual({
      "order-it": { verdict: "fix", reasons: ["unclear"], note: "x" },
      "explain-it": { verdict: "keep", reasons: [], note: "", assumed: true },
    });
  });

  it("are none without a review", () => {
    expect(earlierVerdicts(quiz, null)).toEqual({});
  });
});

describe("the form's bundle and its words", () => {
  it("is under 60 KB gzipped, as the page runtime is", () => {
    const size = gzipSync(Buffer.from(script)).length;
    console.log(`review form: ${script.length} bytes, ${size} bytes gzipped (limit ${60 * 1024})`);
    expect(size).toBeLessThan(60 * 1024);
  });

  it("is not in the page runtime, and the page runtime's words are not in it twice", () => {
    const page = readFileSync(join(dist, "page.js"), "utf8");
    expect(page).not.toContain("Mark them Keep and finish");
    expect(page).not.toContain("Answer key wrong");
    expect(script).toContain("Mark them Keep and finish");
  });

  const shape = (value: unknown): unknown =>
    typeof value === "function"
      ? `fn/${value.length}`
      : value !== null && typeof value === "object"
        ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shape(v)]))
        : "text";

  it("exist in English and Vietnamese with the same keys, and the same arguments for each function", () => {
    expect(shape(reviewVi)).toEqual(shape(reviewEn));
  });

  it("say the board's words (the ReviewVi board, G46)", () => {
    expect(reviewVi.finish).toBe("Hoàn tất");
    expect(reviewVi.keepRest).toBe("Giữ các câu còn lại");
    expect(reviewVi.judged(16, 32)).toBe("Đã xét 16 / 32");
    expect(reviewVi.position(20, 32)).toBe("Câu 20 / 32");
    expect(reviewVi.reason["key-wrong"]).toBe("Đáp án sai");
    expect(reviewVi.doneLine("review.json", 27, 16, 4, 1)).toBe("review.json: 27 giữ (16 chưa xem), 4 sửa, 1 bỏ.");
    expect(reviewEn.doneLine("review.json", 27, 16, 4, 1)).toBe(
      "review.json: 27 keep (16 not looked at), 4 fix, 1 drop.",
    );
    expect(reviewEn.dlgTitle(1)).toBe("1 question not judged");
    expect(reviewEn.dlgTitle(14)).toBe("14 questions not judged");
  });
});
describe("the page with --since", () => {
  it("holds what was asked, and for a changed question the earlier verdict and both blocks", () => {
    const blocks = new Map<string, string>();
    const parsed = parse(SOURCE, "quiz.md", { blocks }).quiz;
    if (parsed === null) throw new Error("the fixture does not parse");
    const questions = parsed.sections.flatMap((s) => s.questions);
    const hash = (id: string) => questions.find((q) => q.id === id)?.hash ?? "";
    const review: Review = {
      format: "fullmark-review",
      version: 2,
      quizId: "every",
      quizHash: "a".repeat(64),
      reviewedAt: "2026-10-28T09:00:00+07:00",
      questions: {
        // judged on another version: asked again, with its block as judged
        "order-it": {
          verdict: "fix",
          reasons: ["unclear"],
          note: "",
          hash: "b".repeat(64),
          source: "## Order\n",
        },
        // kept on another version: asked again, with no block to show
        "match-it": { verdict: "keep", reasons: [], note: "", hash: "c".repeat(64), assumed: true },
        // unchanged: not asked
        "explain-it": { verdict: "keep", reasons: [], note: "", hash: hash("explain-it") },
      },
    };
    const asked = questions.map((q) => q.id).filter((id) => review.questions[id]?.hash !== hash(id));
    const data = dataOf(buildReviewForm(options(SOURCE, { quiz: parsed, review, since: { asked, blocks } })));
    expect(data.since?.asked).toEqual(asked);
    expect(asked).not.toContain("explain-it");
    expect(asked).toContain("bank-one");
    expect(data.since?.reviewedAt).toBe("2026-10-28T09:00:00+07:00");
    // a new question has no earlier verdict, so it is asked but is not among the changed
    expect(Object.keys(data.since?.changed ?? {}).sort()).toEqual(["match-it", "order-it"]);
    expect(data.since?.changed["order-it"]).toEqual({
      earlier: { verdict: "fix", reasons: ["unclear"], note: "" },
      before: "## Order\n",
      after: blocks.get(hash("order-it")),
    });
    expect(data.since?.changed["match-it"]?.before).toBeNull();
    expect(data.since?.changed["match-it"]?.earlier).toEqual({
      verdict: "keep",
      reasons: [],
      note: "",
      assumed: true,
    });
    // the unchanged question's verdict is the form's to hand back; a changed one's is not
    expect(Object.keys(data.earlier)).toEqual(["explain-it"]);
    // without --since there is no such key
    expect(dataOf(buildReviewForm(options(SOURCE, { quiz: parsed }))).since).toBeUndefined();
  });
});
