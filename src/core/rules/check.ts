import type { ResolvedProfile } from "../config/resolve";
import type { Brief, Question, Quiz } from "../ir";
import type { Issue, Level } from "../issue";
import { suggest } from "../parse/report";
import type { Review } from "../review/schema";
import { runCustom } from "./custom";
import { findRule, RULES } from "./registry";
import { reviewFindings } from "./review";
import type { Finding } from "./types";

export type CheckInput = {
  /** the parsed quiz; null when the syntax has errors (then only those are reported) */
  quiz: Quiz | null;
  /** what the parser and the asset loader found */
  issues: readonly Issue[];
  file: string;
  profile: ResolvedProfile;
  /** the brief beside the quiz, already read; its own findings (`brief.invalid`) are in `briefIssues` */
  brief: Brief | null;
  briefIssues: readonly Issue[];
  /** the files under the brief's `content/`, or null when it was not looked at */
  contentFiles: readonly string[] | null;
  /** the review given to `check --review`: its fixed rules run, and `review.unconfirmed` with them; absent otherwise */
  review?: Review | null;
  /** the review's path as given to `check --review` (with `file`, the quiz's), so a hint can name the real files */
  reviewShown?: string | null;
};

export type Ignored = { rule: string; line: number; because: string };
export type CheckOutput = { issues: Issue[]; ignored: Ignored[] };

const compare = (a: string | number, b: string | number) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Everything `check` knows about one quiz: the syntax issues, the quality rules at the levels the profile gives
 * them, the profile's custom checks, and `check-ignore` (invalid ones, and the valid ones, which hide a finding
 * and are reported as `config.ignored` so that nothing is silently hidden).
 */
export function runChecks(input: CheckInput): CheckOutput {
  const { quiz, profile, file } = input;
  const out: Issue[] = [];
  const levelOf = (rule: string): Level => profile.rules.get(rule)?.level ?? "warning";

  // The parser and the loader only know a rule's own level; quality rules take the profile's.
  for (const i of [...input.issues, ...input.briefIssues]) {
    if (findRule(i.rule)?.kind === "quality") {
      const level = levelOf(i.rule);
      if (level !== "off") out.push({ ...i, level });
    } else out.push(i);
  }

  if (quiz) {
    const shown = input.reviewShown == null ? null : { quiz: file, review: input.reviewShown };
    const ctx = { brief: input.brief, contentFiles: input.contentFiles, review: input.review ?? null, shown };
    const add = (rule: string, level: Level, findings: Finding[]) => {
      for (const f of findings) {
        out.push({ rule, level, file, line: f.line, message: f.message, ...(f.fix ? { fix: f.fix } : {}) });
      }
    };
    for (const rule of RULES) {
      if (rule.kind !== "quality") continue;
      const resolved = profile.rules.get(rule.id);
      if (!resolved || resolved.level === "off") continue;
      add(rule.id, resolved.level, rule.run(quiz, ctx, resolved.options));
    }
    if (ctx.review) {
      const found = reviewFindings(quiz, ctx.review, shown);
      add("review.fix", "error", found.fix);
      add("review.drop", "error", found.drop);
    }
    for (const check of profile.checks) {
      const level = levelOf(check.id);
      if (level !== "off") add(check.id, level, runCustom(quiz, check));
    }
  }

  const ignored: Ignored[] = [];
  const final = quiz ? applyIgnores(quiz, out, profile, file, ignored) : out;
  // the quiz's own issues first, then each sheet's
  const own = (i: Issue) => (i.file === file ? 0 : 1);
  final.sort(
    (a, b) =>
      own(a) - own(b) ||
      compare(a.file, b.file) ||
      compare(a.line, b.line) ||
      compare(a.rule, b.rule) ||
      compare(a.message, b.message),
  );
  return { issues: final, ignored };
}

/** The question whose block holds `line`. */
function questionAt(questions: readonly Question[], line: number): Question | undefined {
  let found: Question | undefined;
  for (const q of questions) if (q.line <= line) found = q;
  return found;
}

function applyIgnores(
  quiz: Quiz,
  issues: Issue[],
  profile: ResolvedProfile,
  file: string,
  ignored: Ignored[],
): Issue[] {
  const questions = quiz.sections.flatMap((s) => s.questions).sort((a, b) => a.line - b.line);
  const suppress = new Set<string>(); // "questionLine\0rule"
  const extra: Issue[] = [];
  const configurable = RULES.filter((r) => r.kind === "quality").map((r) => r.id);

  for (const q of questions) {
    const ig = q.ignore;
    if (!ig) continue;
    const invalid = (message: string, fix: string) =>
      extra.push({ rule: "ignore.invalid", level: "error", file, line: ig.line, message, fix });
    const hasReason = ig.because !== null && ig.because.trim() !== "";
    if (ig.rules.length > 0 && !hasReason) {
      invalid(
        "check-ignore needs a reason",
        'add because="why this finding does not apply here"; the reason is required',
      );
    }
    if (ig.rules.length === 0 && hasReason) {
      invalid(
        "because has no check-ignore to explain",
        'add check-ignore="rule.id" next to because, or remove because: the reason belongs to an ignore',
      );
    }
    for (const id of ig.rules) {
      const rule = findRule(id);
      const custom = profile.rules.get(id)?.kind === "custom";
      if (rule?.kind === "fixed") {
        invalid(`\`${id}\` is a fixed rule, which cannot be ignored`, "fix the quiz instead of ignoring the rule");
        continue;
      }
      if (!rule && !custom) {
        const near = suggest(id, [
          ...configurable,
          ...[...profile.rules.values()].filter((r) => r.kind === "custom").map((r) => r.id),
        ]);
        invalid(
          `check-ignore names \`${id}\`, which is not a rule`,
          near ? `did you mean \`${near}\`?` : "`quiz rules` lists the rules",
        );
        continue;
      }
      if (!hasReason) continue;
      const because = (ig.because ?? "").trim();
      ignored.push({ rule: id, line: ig.line, because });
      if (profile.allowIgnore) {
        suppress.add(`${q.line}\u0000${id}`);
        extra.push({
          rule: "config.ignored",
          level: "info",
          file,
          line: ig.line,
          message: `\`${id}\` is ignored here: ${because}`,
        });
      } else {
        extra.push({
          rule: "config.ignored",
          level: "error",
          file,
          line: ig.line,
          message: `\`${id}\` is ignored here, but profile ${profile.name} does not allow ignores`,
          fix: `remove check-ignore and fix the quiz (allow-ignore = false: ${profile.allowIgnoreOrigin})`,
        });
      }
    }
  }
  const kept = issues.filter((i) => {
    const q = questionAt(questions, i.line);
    return !(q && suppress.has(`${q.line}\u0000${i.rule}`));
  });
  return [...kept, ...extra];
}
