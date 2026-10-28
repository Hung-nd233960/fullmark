import type { Messages } from "../i18n";
import type { Report, ReportGroup, ReportOpen, ReportQuestion } from "./build";
import { formatDuration } from "./duration";

const cell = (s: string | number | null): string =>
  s === null
    ? ""
    : String(s)
        .replace(/\|/g, "\\|")
        .replace(/\s*\n\s*/g, " ");

const quote = (md: string): string =>
  md
    .trim()
    .split("\n")
    .map((l) => (l === "" ? ">" : `> ${l}`))
    .join("\n");

/** A fence longer than any run of backticks inside, so the text cannot close it. */
function fenced(text: string, info = ""): string {
  const longest = Math.max(2, ...(text.match(/`+/g) ?? []).map((r) => r.length));
  const fence = "`".repeat(longest + 1);
  return `${fence}${info}\n${text.replace(/\s+$/, "")}\n${fence}`;
}

const table = (head: string[], rows: (string | number | null)[][]): string =>
  [
    `| ${head.map(cell).join(" | ")} |`,
    `| ${head.map(() => "---").join(" | ")} |`,
    ...rows.map((r) => `| ${r.map(cell).join(" | ")} |`),
  ].join("\n");

const groupTable = (title: string, groups: ReportGroup[], m: Messages["report"]): string[] =>
  groups.length === 0
    ? []
    : [
        `## ${title}`,
        table(
          [m.name, m.questionsWord, m.earned, m.points, m.percent],
          groups.map((g) => [
            g.title ?? g.id,
            g.questions,
            g.earned,
            g.points,
            g.percent === null ? "" : `${g.percent}%`,
          ]),
        ),
      ];

function rubricLines(o: ReportOpen, m: Messages["report"]): string[] {
  const r = o.rubric;
  if (r.mode === "additive") {
    return [
      `${m.rubricMode(m.mode[r.mode])}, ${m.step(r.step)}`,
      table(
        [m.criterion, "id", m.max],
        r.criteria.map((c) => [c.text, c.id, c.max]),
      ),
    ];
  }
  if (r.mode === "banded") {
    return [
      `${m.rubricMode(m.mode[r.mode])}, ${m.scale(r.scale.min, r.scale.max, r.scale.step, r.round)}`,
      table(
        [m.criterion, "id", m.weight],
        r.criteria.map((c) => [c.text, c.id, c.weight]),
      ),
    ];
  }
  const head = `${m.rubricMode(m.mode[r.mode])}${r.step === null ? "" : `, ${m.step(r.step)}`}`;
  return r.criteria.length === 0 ? [head] : [head, r.criteria.map((c) => `- ${c.text} (\`${c.id}\`)`).join("\n")];
}

function gradeLines(o: ReportOpen, m: Messages["report"]): string[] {
  const g = o.grade;
  if (!g) return [`**${m.grades}:** ${m.waiting}`];
  const out: string[] = [];
  const line = [m.gradedBy(g.graded_by.name, g.graded_by.kind)];
  if (!g.rubric_current) line.push(`(${m.olderRubric})`);
  out.push(
    `**${m.grades}:** ${line.join(" ")}. ${g.earned} / ${g.points}${g.band === null ? "" : `. ${m.overallBand(g.band)}`}`,
  );
  if (g.mode === "additive") {
    out.push(
      table(
        [m.criterion, m.earned, m.max, m.note],
        g.criteria.map((c) => [c.text, c.earned, c.max, c.note]),
      ),
    );
  } else if (g.mode === "banded") {
    out.push(
      table(
        [m.criterion, m.band, m.weight, m.note],
        g.criteria.map((c) => [c.text, c.band, c.weight, c.note]),
      ),
    );
  } else if (g.criteria.length > 0) {
    out.push(
      table(
        [m.criterion, m.verdict],
        g.criteria.map((c) => [c.text, c.verdict]),
      ),
    );
  }
  if (g.justification) out.push(`**${m.justification}:** ${g.justification}`);
  if (g.improvement) out.push(`**${m.improvement}:** ${g.improvement}`);
  return out;
}

function openBlock(o: ReportOpen, m: Messages["report"]): string[] {
  const words = o.words === null ? "" : ` - ${m.words(o.words)}`;
  return [
    `### ${o.id} (${o.points} ${m.points.toLowerCase()})${words}`,
    quote(o.prompt),
    `**${m.answer}:**`,
    fenced(o.answer, o.language ?? ""),
    ...rubricLines(o, m),
    ...(o.sample_answer ? [`**${m.sampleAnswer}:**`, fenced(o.sample_answer, o.language ?? "")] : []),
    ...gradeLines(o, m),
  ];
}

function questionBlock(q: ReportQuestion, m: Messages["report"], showKey: boolean): string[] {
  const pts = q.earned === null ? "" : `${q.earned} / ${q.points}`;
  const out = [
    `### ${q.id} - ${m.status[q.status]}${pts === "" ? "" : ` (${pts})`}`,
    quote(q.prompt),
    `**${m.yourAnswer}:** ${q.answer === null ? m.noAnswer : q.answer.includes("\n") ? `\n\n${fenced(q.answer)}` : q.answer}`,
  ];
  if (showKey && q.key !== null) out.push(`**${m.correctAnswer}:** ${q.key}`);
  if (showKey && q.explanation) out.push(`**${m.explanation}:**\n\n${q.explanation.trim()}`);
  return out;
}

/** The report as Markdown, in the quiz's interface language (the caller picks the catalog). */
export function renderMarkdown(report: Report, m: Messages["report"]): string {
  const survey = report.quiz.kind === "survey";
  const out: string[] = [`# ${survey ? m.surveyTitle(report.quiz.title) : m.title(report.quiz.title)}`];

  const facts: [string, string][] = [
    [m.quiz, `${report.quiz.id}`],
    [m.version, `\`${report.quiz.hash.slice(0, 12)}\``],
    [m.plan, m.planOf(report.attempt.questions, report.attempt.source)],
    [m.started, report.attempt.started ?? m.notSubmitted],
    [m.submitted, report.attempt.submitted ?? m.notSubmitted],
    [m.timeUsed, `${formatDuration(report.attempt.time_used, m)}${report.attempt.timed_out ? ` (${m.timedOut})` : ""}`],
  ];
  out.push(facts.map(([k, v]) => `- **${k}:** ${v}`).join("\n"));

  if (report.score) {
    const s = report.score;
    out.push(`## ${m.score}`);
    out.push(`**${m.scoreLine(String(s.earned), String(s.points), String(s.percent ?? 0))}**`);
    if (s.pending > 0) out.push(m.pendingLine(String(s.pending)));
    if (s.pass.mark !== null && s.pass.passed !== null) out.push(m.passMark(s.pass.mark, s.pass.passed));
  }
  if (report.unknown.length > 0) out.push(m.unknownQuestions(report.unknown.join(", ")));
  if (report.grades && report.grades.warnings.length > 0) {
    out.push(`## ${m.warnings}`, report.grades.warnings.map((w) => `- ${w}`).join("\n"));
  }
  out.push(...groupTable(m.sections, report.sections, m), ...groupTable(m.tags, report.tags, m));

  if (survey) {
    out.push(`## ${m.answers}`);
    for (const q of report.questions) out.push(...questionBlock(q, m, false));
    return `${out.join("\n\n")}\n`;
  }

  const wrong = report.questions.filter((q) => report.wrong.includes(q.id));
  out.push(`## ${m.wrong}`);
  if (wrong.length === 0) out.push(m.noneWrong);
  for (const q of wrong) out.push(...questionBlock(q, m, true));

  if (report.open.length > 0) {
    out.push(`## ${m.toGrade}`);
    for (const o of report.open) out.push(...openBlock(o, m));
  }
  return `${out.join("\n\n")}\n`;
}
