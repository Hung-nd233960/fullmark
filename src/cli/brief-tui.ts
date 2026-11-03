import type { Readable, Writable } from "node:stream";
import {
  defaultOf,
  type Lang,
  parseNumber,
  type Question,
  type QuestionFile,
  type QuestionValue,
  questionOf,
  wordCount,
} from "../core/brief/questions";
import type { ContentKind, MixKind, Purpose } from "../core/brief/write";
import type { Given } from "./brief";

/**
 * The `--tui` form (COMMANDS.md, `quiz brief`). It reads the question file for every word of every question, draws on
 * the `output` it is given (stderr) and reads `input` (stdin), so a test can drive it in process. It decides nothing
 * about the file: it returns what the person answered as flags would (`Given`), and `runBrief` builds the answers and
 * the bytes from that, exactly as for flags. An answer left at its pre-filled default is not returned (it is a
 * default); one that was changed, typed, or pre-filled by a flag is (it is `user`).
 */

/** The words of the form itself, which the question file does not hold. */
const UI = {
  en: {
    intro: "quiz brief",
    step: (n: number, of: number, title: string) => `Step ${n}/${of}: ${title}`,
    summary: "Your answers",
    isDefault: "default",
    none: "none",
    empty: "empty",
    ready: "Ready to write brief.yaml?",
    write: "Write brief.yaml",
    change: (label: string) => `Change: ${label}`,
    needed: "An answer is needed.",
    tooShort: (words: number, min: number, example: string) =>
      `That is ${words} word${words === 1 ? "" : "s"}; ${min} or more say what the quiz covers, for example "${example}"`,
    notNumber: (problem: string) => `It ${problem}`,
  },
  vi: {
    intro: "quiz brief",
    step: (n: number, of: number, title: string) => `Bước ${n}/${of}: ${title}`,
    summary: "Các câu trả lời của bạn",
    isDefault: "mặc định",
    none: "không có",
    empty: "để trống",
    ready: "Ghi brief.yaml chưa?",
    write: "Ghi brief.yaml",
    change: (label: string) => `Sửa: ${label}`,
    needed: "Cần có câu trả lời.",
    tooShort: (words: number, min: number, example: string) =>
      `Mới có ${words} từ; từ ${min} từ trở lên mới nói rõ bài kiểm tra gồm gì, ví dụ "${example}"`,
    notNumber: (problem: string) => `Giá trị ${problem}`,
  },
} satisfies Record<Lang, unknown>;

export type FormContext = {
  questions: QuestionFile;
  lang: Lang;
  /** the answers the flags gave: they pre-fill the form and, kept, are recorded as the user's */
  prefill: Given;
  /** the machine config's `[brief.purpose.<purpose>]` table, which replaces that purpose's defaults */
  overridesOf: (purpose: Purpose) => Readonly<Record<string, QuestionValue>>;
  /** what is wrong with a profile name, or null when it exists */
  profileProblem: (name: string) => string | null;
  input: Readable;
  output: Writable;
  /** Ctrl+C when no prompt is listening (raw mode is off between prompts) */
  signal: AbortSignal;
};

/** The width the form draws at when the output reports none (G29). */
export const FALLBACK_COLUMNS = 80;

/**
 * Under `script(1)`, and on some serial consoles, the width starts at 0 and clack would draw one character per line.
 * An output that reports no usable width is seen through a proxy that says 80; a real width is left alone.
 */
export function withWidth(output: Writable): Writable {
  const columns = (output as { columns?: unknown }).columns;
  if (typeof columns === "number" && columns > 0) return output;
  return new Proxy(output, {
    get(target, key) {
      if (key === "columns") {
        const now = (target as { columns?: unknown }).columns;
        return typeof now === "number" && now > 0 ? now : FALLBACK_COLUMNS;
      }
      const value = Reflect.get(target, key, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
    has: (target, key) => key === "columns" || Reflect.has(target, key),
  });
}

/** What the person answered as `Given`, or "cancelled" when they pressed Ctrl+C at any step. Writes nothing. */
export async function askForm(ctx: FormContext): Promise<Given | "cancelled"> {
  // loaded here and nowhere else: `check` and `brief` through flags never load the prompts
  const clack = await import("@clack/prompts");
  const { questions, lang } = ctx;
  const t = UI[lang];
  const common = { input: ctx.input, output: withWidth(ctx.output), signal: ctx.signal };
  const q = (key: string): Question => questionOf(questions, key);
  const sameValue = (a: QuestionValue, b: QuestionValue): boolean => JSON.stringify(a) === JSON.stringify(b);

  /** The answers that count: a key is here when the person chose it (typed, changed, or a flag gave it). */
  const kept = new Map<string, QuestionValue>();
  /** Keys a flag gave: kept as the user's even when they equal the default. */
  const flagged = new Set<string>();
  const seed = (key: string, value: QuestionValue | undefined): void => {
    if (value === undefined) return;
    kept.set(key, value);
    flagged.add(key);
  };
  const pre = ctx.prefill;
  seed("purpose", pre.purpose);
  seed("scope", pre.scope);
  seed("content.kinds", pre.kinds);
  seed("kinds_other", pre.kindsOther);
  seed("content.elsewhere", pre.elsewhere);
  seed("count", pre.count);
  seed("minutes", pre.minutes);
  seed("mix", pre.mix);
  seed("difficulty", pre.difficulty);
  seed("mode", pre.mode);
  seed("weak_topics", pre.weakTopics === undefined ? undefined : pre.weakTopics ? "yes" : "no");
  seed("commitment", pre.commitment);
  seed("language", pre.language);
  seed("request", pre.request);
  seed("profile", pre.profile);

  const purpose = (): Purpose | undefined => kept.get("purpose") as Purpose | undefined;
  /** What a question holds now: the person's answer, else the default of the purpose (nothing for the human-only). */
  const current = (question: Question): QuestionValue | undefined => {
    const own = kept.get(question.key);
    if (own !== undefined) return own;
    if (question["human-only"] && question.optional !== true) return undefined;
    const p = purpose() ?? (q("purpose").default as Purpose);
    return defaultOf(question, p, ctx.overridesOf(p));
  };
  const defaultNow = (question: Question): QuestionValue => {
    const p = purpose() ?? (q("purpose").default as Purpose);
    return defaultOf(question, p, ctx.overridesOf(p));
  };
  /** Records an answer: left at its default it is a default again (and follows the purpose), else it is the user's. */
  const record = (question: Question, value: QuestionValue): void => {
    const human = question["human-only"] === true && question.optional !== true;
    if (human || flagged.has(question.key) || !sameValue(value, defaultNow(question))) kept.set(question.key, value);
    else kept.delete(question.key);
  };

  const sections = questions.sections;
  const textOf = (v: { en: string; vi: string }): string => v[lang];
  const labelOf = (question: Question, value: string): string =>
    textOf(question.choices?.find((c) => c.value === value)?.label ?? { en: value, vi: value });
  const shown = (question: Question, value: QuestionValue | undefined): string => {
    if (value === undefined || value === "") return t.empty;
    if (Array.isArray(value)) return value.length === 0 ? t.none : value.map((v) => labelOf(question, v)).join(", ");
    if (question.kind === "choice") return labelOf(question, String(value));
    return String(value);
  };
  /** The question's help is shown above its prompt, so the prompt itself stays one line. */
  const messageOf = (label: string, help: string): string => {
    clack.log.message(help, common);
    return label;
  };

  /** One question; returns false when the person cancelled. */
  async function ask(question: Question): Promise<boolean> {
    const now = current(question);
    const message = messageOf(textOf(question.label), textOf(question.help));
    let answer: unknown;
    if (question.kind === "choice") {
      answer = await clack.select<string>({
        ...common,
        message,
        options: (question.choices ?? []).map((c) => ({
          value: c.value,
          label: textOf(c.label),
          hint: textOf(c.hint),
        })),
        ...(now === undefined ? {} : { initialValue: String(now) }),
      });
    } else if (question.kind === "multi") {
      answer = await clack.multiselect<string>({
        ...common,
        message,
        required: false,
        options: (question.choices ?? []).map((c) => ({
          value: c.value,
          label: textOf(c.label),
          hint: textOf(c.hint),
        })),
        initialValues: now === undefined ? [] : (now as string[]),
      });
    } else {
      const minWords = question["min-words"];
      const example = question.example ? textOf(question.example) : "";
      const whole = question.key !== "minutes";
      answer = await clack.text({
        ...common,
        message,
        initialValue: now === undefined ? "" : String(now),
        ...(example === "" ? {} : { placeholder: example }),
        validate: (raw) => {
          const text = (raw ?? "").trim();
          if (question.kind === "number") {
            // an optional number left empty is its default (commitment: no goal)
            if (text === "" && question.optional === true) return undefined;
            const parsed = parseNumber(question, text, whole);
            return "problem" in parsed ? t.notNumber(parsed.problem.replace(/, not ".*$/, "")) : undefined;
          }
          if (text === "" && question["human-only"] === true && question.optional !== true) return t.needed;
          if (minWords !== undefined && wordCount(text) < minWords)
            return t.tooShort(wordCount(text), minWords, example);
          if (question.key === "profile") {
            if (text === "") return t.needed;
            return ctx.profileProblem(text) ?? undefined;
          }
          return undefined;
        },
      });
      if (!clack.isCancel(answer)) {
        const text = String(answer).trim();
        answer =
          question.kind === "number"
            ? text === ""
              ? defaultNow(question)
              : Number(text)
            : question.key === "scope"
              ? text
              : String(answer);
      }
    }
    if (clack.isCancel(answer)) return false;
    record(question, answer as QuestionValue);

    // the follow-up text box of *other*
    const follow = question["follow-up"];
    if (follow) {
      const picked = Array.isArray(answer) && answer.includes(follow.when);
      if (!picked) {
        kept.delete(follow.key);
        flagged.delete(follow.key);
      } else {
        const text = await clack.text({
          ...common,
          message: messageOf(textOf(follow.label), textOf(follow.help)),
          initialValue: String(kept.get(follow.key) ?? ""),
        });
        if (clack.isCancel(text)) return false;
        if (flagged.has(follow.key) || text !== "") kept.set(follow.key, text);
        else kept.delete(follow.key);
      }
    }
    return true;
  }

  const summaryLines = (): string =>
    questions.questions
      .flatMap((question) => {
        const own = kept.has(question.key);
        const line = (label: string, value: string, isOwn: boolean): string =>
          `${label}: ${value}${isOwn ? "" : ` (${t.isDefault})`}`;
        const lines = [line(textOf(question.label), shown(question, current(question)), own)];
        const follow = question["follow-up"];
        if (follow && kept.has(follow.key)) lines.push(line(textOf(follow.label), String(kept.get(follow.key)), true));
        return lines;
      })
      .join("\n");

  clack.intro(t.intro, common);
  let step = -1;
  for (const question of questions.questions) {
    const at = sections.findIndex((s) => s.id === question.section);
    if (at !== step) {
      step = at;
      clack.log.step(t.step(at + 1, sections.length, textOf(sections[at]?.title ?? { en: "", vi: "" })), common);
    }
    if (!(await ask(question))) return "cancelled";
  }

  for (;;) {
    clack.note(summaryLines(), t.summary, common);
    const next = await clack.select<string>({
      ...common,
      message: t.ready,
      options: [
        { value: "", label: t.write },
        ...questions.questions.map((question) => ({ value: question.key, label: t.change(textOf(question.label)) })),
      ],
      initialValue: "",
    });
    if (clack.isCancel(next)) return "cancelled";
    if (next === "") break;
    if (!(await ask(q(next)))) return "cancelled";
  }

  const get = <T extends QuestionValue>(key: string): T | undefined => kept.get(key) as T | undefined;
  const given: Given = {};
  const set = <K extends keyof Given>(k: K, v: Given[K] | undefined): void => {
    if (v !== undefined) given[k] = v;
  };
  set("purpose", get<string>("purpose") as Purpose | undefined);
  set("scope", get<string>("scope"));
  set("kinds", get<string[]>("content.kinds") as ContentKind[] | undefined);
  set("kindsOther", get<string>("kinds_other"));
  set("elsewhere", get<string>("content.elsewhere"));
  set("count", get<number>("count"));
  set("minutes", get<number>("minutes"));
  set("mix", get<string[]>("mix") as MixKind[] | undefined);
  set("difficulty", get<string>("difficulty"));
  set("mode", get<string>("mode"));
  const weak = get<string>("weak_topics");
  set("weakTopics", weak === undefined ? undefined : weak === "yes");
  set("commitment", get<number>("commitment"));
  set("language", get<string>("language") as Lang | undefined);
  set("request", get<string>("request"));
  set("profile", get<string>("profile"));
  return given;
}
