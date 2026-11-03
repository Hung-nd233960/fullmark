import { QUESTION_TYPES, type Question, type Quiz } from "./ir";
import { correctPositions } from "./positions";

/** What `quiz inspect` says about a quiz (COMMANDS.md, `quiz inspect`). Pure: the CLI prints it. */
export type Summary = {
  quiz: { id: string; title: string; hash: string; short: string };
  questions: number;
  points: number;
  /** seconds; null when untimed */
  timeLimit: number | null;
  types: { type: string; count: number; points: number }[];
  sections: {
    id: string;
    title: string | null;
    questions: number;
    points: number;
    pick: number | null;
    time: number | null;
  }[];
  /** the questions without a tag are the last entry, with `tag: null` */
  tags: { tag: string | null; count: number; points: number }[];
  /** letter to the number of correct choices of `single` and `multi` questions there, in source order */
  positions: Record<string, number>;
};

/** Floating-point noise from a bank's share of points is rounded away. */
const round = (n: number): number => Math.round(n * 1e6) / 1e6;

/**
 * Counts a quiz. Points are the points a learner can earn: ungraded questions earn none, and a bank (`pick`) counts
 * the questions drawn, not its pool, each question carrying its share (pick over pool size) of its points. The
 * number of questions is the number in the file. The positions are those of the file's source order, as
 * `answers.position-skew` reads them.
 */
export function summarise(quiz: Quiz, hash: string): Summary {
  const types = new Map<string, { count: number; points: number }>();
  const tags = new Map<string, { count: number; points: number }>();
  const untagged = { count: 0, points: 0 };
  const positions = new Map<number, number>();
  let width = 0;
  const add = (map: Map<string, { count: number; points: number }>, key: string, points: number): void => {
    const row = map.get(key) ?? { count: 0, points: 0 };
    row.count++;
    row.points += points;
    map.set(key, row);
  };

  const sections = quiz.sections.map((s) => {
    const share = s.pick !== null && s.questions.length > 0 ? s.pick / s.questions.length : 1;
    let points = 0;
    for (const q of s.questions) {
      const own = (q.graded ? q.points : 0) * share;
      points += own;
      add(types, q.type, own);
      if (q.tags.length === 0) {
        untagged.count++;
        untagged.points += own;
      }
      for (const tag of q.tags) add(tags, tag, own);
      for (const at of correctPositions(q)) positions.set(at, (positions.get(at) ?? 0) + 1);
      width = Math.max(width, choiceCount(q));
    }
    return {
      id: s.id,
      title: s.title,
      questions: s.questions.length,
      points: round(points),
      pick: s.pick,
      time: s.time,
    };
  });

  const byCount = (a: [string, { count: number }], b: [string, { count: number }]): number =>
    b[1].count - a[1].count || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
  const tagRows: Summary["tags"] = [...tags]
    .sort(byCount)
    .map(([tag, v]) => ({ tag, count: v.count, points: round(v.points) }));
  if (untagged.count > 0) tagRows.push({ tag: null, count: untagged.count, points: round(untagged.points) });

  const letters: Record<string, number> = {};
  for (let i = 0; i < width; i++) letters[String.fromCharCode(65 + i)] = positions.get(i) ?? 0;

  return {
    quiz: { id: quiz.frontMatter.id, title: quiz.frontMatter.title, hash, short: hash.slice(0, 4) },
    questions: sections.reduce((n, s) => n + s.questions, 0),
    points: round(sections.reduce((n, s) => n + s.points, 0)),
    timeLimit: quiz.frontMatter.timeLimit,
    types: QUESTION_TYPES.filter((t) => types.has(t)).map((type) => {
      const v = types.get(type) as { count: number; points: number };
      return { type, count: v.count, points: round(v.points) };
    }),
    sections,
    tags: tagRows,
    positions: letters,
  };
}

const choiceCount = (q: Question): number => (q.type === "single" || q.type === "multi" ? q.choices.length : 0);

/** `90s`, `45m`, `1h30m`: the forms `time_limit` is written in. */
export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  return `${h > 0 ? `${h}h` : ""}${m > 0 ? `${m}m` : ""}${s > 0 || seconds === 0 ? `${s}s` : ""}`;
}

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? "" : "s"}`;

/** The summary as the lines `quiz inspect` prints (COMMANDS.md): the first item of a row spells out its unit. */
export function summaryLines(s: Summary): string[] {
  const titled = s.sections.filter((x) => x.title !== null);
  const head = [
    plural(s.questions, "question"),
    plural(s.points, "point"),
    titled.length > 0 ? plural(titled.length, "section") : "no sections",
    s.timeLimit === null ? "untimed" : `time limit ${formatDuration(s.timeLimit)}`,
  ];
  const lines = [`${s.quiz.id} · ${s.quiz.title} · version ${s.quiz.short}`, head.join(" · ")];
  const row = (name: string, items: string[]): void => {
    if (items.length > 0) lines.push(`${name.padEnd(10)}${items.join(" · ")}`);
  };
  row(
    "Types",
    s.types.map((t, i) => `${t.type} ${t.count} (${i === 0 ? plural(t.points, "point") : t.points})`),
  );
  row(
    "Sections",
    titled.map((x, i) => {
      const nums =
        i === 0 ? `${plural(x.questions, "question")}, ${plural(x.points, "point")}` : `${x.questions}, ${x.points}`;
      return `${x.id} ${nums}${x.pick !== null ? `, pick ${x.pick}` : ""}${x.time !== null ? `, ${formatDuration(x.time)}` : ""}`;
    }),
  );
  row(
    "Tags",
    s.tags.map((t) => `${t.tag ?? "no tag"} ${t.count}`),
  );
  // a quiz with no right answers to place (a survey) has no spread to show
  const placed = Object.values(s.positions).some((n) => n > 0);
  row("Positions", placed ? Object.entries(s.positions).map(([letter, n]) => `${letter} ${n}`) : []);
  return lines;
}
