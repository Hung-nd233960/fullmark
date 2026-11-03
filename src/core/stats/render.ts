import type { StatsAttempt, StatsSummary } from "./summary";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "3 Oct", or "3 Oct 2025" when the attempts are not all from one year. The date part of the stamp as written. */
function dateOf(submitted: string | null, withYear: boolean): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(submitted ?? "");
  if (!m) return "not submitted";
  const month = MONTHS[Number(m[2]) - 1] ?? m[2];
  return `${Number(m[3])} ${month}${withYear ? ` ${m[1]}` : ""}`;
}

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? "" : "s"}`;
const trim = (n: number): string => String(Math.round(n * 100) / 100);
const short = (text: string, max: number): string => {
  const chars = [...text];
  return chars.length <= max
    ? text
    : `${chars
        .slice(0, max - 1)
        .join("")
        .trimEnd()}…`;
};

function attemptLine(a: StatsAttempt, withYear: boolean): string {
  const bits = [dateOf(a.submitted, withYear)];
  if (a.percent !== null) bits.push(`${Math.round(a.percent)}%`);
  const notes: string[] = [];
  if (a.plan.source === "section") notes.push(a.plan.section === null ? "section" : `section ${a.plan.section}`);
  else if (a.plan.source !== "full") notes.push(a.plan.source);
  if (a.pending > 0) notes.push(`${trim(a.pending)} points pending`);
  return `${bits.join(" ")}${notes.length > 0 ? ` (${notes.join(", ")})` : ""}`;
}

/** The lines `quiz stats` prints (COMMANDS.md): label column of ten characters, then the facts joined by " · ". */
export function renderStats(s: StatsSummary): string[] {
  const row = (label: string, text: string): string => `${label.padEnd(10)} ${text}`;
  const versions = new Set(s.attempts.map((a) => a.version)).size;
  const out = [
    `${s.quiz.id} · ${s.quiz.title} · ${plural(s.attempts.length, "attempt")}, ${plural(versions, "version")}`,
  ];
  const years = new Set(s.attempts.map((a) => (a.submitted ?? "").slice(0, 4)));
  out.push(row("Attempts", s.attempts.map((a) => attemptLine(a, years.size > 1)).join(" · ")));

  if (s.answers.length > 0) {
    out.push("", "Answers over time");
    for (const q of s.answers) {
      const label = `${q.question} "${short(q.title, 40)}"`;
      const cells = q.answers.map((a) => `${dateOf(a.submitted, years.size > 1)}: ${a.answer ?? "no answer"}`);
      out.push(`  ${label}  ${cells.join(" · ")}`);
    }
    return out;
  }

  if (s.tags.length > 0) {
    out.push(
      row(
        "Tags",
        s.tags
          .map((t) => {
            const name = t.tag ?? "no tag";
            const pct = t.percent === null ? "-" : `${Math.round(t.percent)}%`;
            return t.tag !== null && s.tags.indexOf(t) === 0
              ? `${name} ${pct} (${trim(t.earned)} of ${trim(t.points)} points)`
              : `${name} ${pct}`;
          })
          .join(" · "),
      ),
    );
  }
  out.push(row("Weakest", s.weakest.length > 0 ? s.weakest.join(", ") : "none yet (a tag needs two attempts)"));
  const missed = s.questions.filter((q) => q.missed > 0).slice(0, 10);
  out.push(
    row(
      "Missed",
      missed.length === 0
        ? "none"
        : missed
            .map(
              (q) =>
                `${q.id} "${short(q.title, 30)}" wrong in ${q.missed} of ${q.seen}${q.changed ? " (changed)" : ""}`,
            )
            .join(" · "),
    ),
  );
  if (s.criteria.length > 0) {
    const many = new Set(s.criteria.map((c) => c.question)).size > 1;
    out.push(
      row(
        "Criteria",
        s.criteria
          .map((c) => {
            const name = many ? `${c.question}/${c.criterion}` : c.criterion;
            return c.band !== null
              ? `${name} band ${c.band.toFixed(1)} average`
              : `${name} ${Math.round(c.percent ?? 0)}% over ${plural(c.attempts, "attempt")}`;
          })
          .join(" · "),
      ),
    );
  }
  return out;
}
