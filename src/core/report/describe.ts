import { type Answer, readAnswer } from "../attempt";
import type { Messages } from "../i18n";
import type { Question } from "../ir";

const one = (md: string): string => md.replace(/\s+/g, " ").trim();
const join = (items: string[]): string => items.join("; ");

/**
 * The learner's answer as plain text, for a report. Indices in the answer are source indices, so they are read
 * against the question as written. Returns null when nothing was answered.
 */
export function describeAnswer(q: Question, answer: Answer | null | undefined, m: Messages["report"]): string | null {
  switch (q.type) {
    case "single": {
      const a = readAnswer("single", answer);
      const c = a?.choice == null ? undefined : q.choices[a.choice];
      if (!c) return null;
      const extra = a?.inputs?.[String(a.choice)];
      return extra ? `${one(c.text)} (${one(extra)})` : one(c.text);
    }
    case "multi": {
      const a = readAnswer("multi", answer);
      const picked = (a?.choices ?? []).flatMap((i) => {
        const c = q.choices[i];
        if (!c) return [];
        const extra = a?.inputs?.[String(i)];
        return [extra ? `${one(c.text)} (${one(extra)})` : one(c.text)];
      });
      return picked.length === 0 ? null : join(picked);
    }
    case "truefalse": {
      const a = readAnswer("truefalse", answer);
      return a?.value == null ? null : a.value ? m.yes : m.no;
    }
    case "numeric": {
      const raw = readAnswer("numeric", answer)?.raw?.trim();
      return raw ? raw : null;
    }
    case "short": {
      const text = readAnswer("short", answer)?.text?.trim();
      return text ? text : null;
    }
    case "blanks": {
      const blanks = readAnswer("blanks", answer)?.blanks ?? [];
      return blanks.every((b) => b.trim() === "") ? null : join(blanks.map((b, i) => `${i + 1}: ${b.trim() || "-"}`));
    }
    case "fields": {
      const given = readAnswer("fields", answer)?.fields ?? [];
      if (given.every((f) => f.trim() === "")) return null;
      return join(q.fields.map((f, i) => `${one(f.label)}: ${given[i]?.trim() || "-"}`));
    }
    case "ordering": {
      const order = readAnswer("ordering", answer)?.order ?? [];
      const items = order.flatMap((i) => (q.items[i] ? [one(q.items[i].text)] : []));
      return items.length === 0 ? null : items.map((t, i) => `${i + 1}. ${t}`).join(" ");
    }
    case "matching": {
      const pairs = readAnswer("matching", answer)?.pairs ?? [];
      const rights = [...q.pairs.map((p) => p.right), ...q.distractors.map((d) => d.text)];
      if (pairs.every((p) => p === null)) return null;
      return join(
        q.pairs.map((p, i) => {
          const r = pairs[i];
          return `${one(p.left)} - ${r == null || rights[r] === undefined ? "-" : one(rights[r])}`;
        }),
      );
    }
    case "essay": {
      const text = readAnswer("essay", answer)?.text;
      return text && text.trim() !== "" ? text : null;
    }
    case "code": {
      const code = readAnswer("code", answer)?.code;
      return code && code.trim() !== "" ? code : null;
    }
    case "scale": {
      const v = readAnswer("scale", answer)?.value;
      return v == null ? null : String(v);
    }
  }
}

/** The right answer as plain text, for the questions that have a key; null for the rest. */
export function describeKey(q: Question): string | null {
  switch (q.type) {
    case "single":
    case "multi": {
      const right = q.choices.filter((c) => c.correct).map((c) => one(c.text));
      return right.length === 0 ? null : join(right);
    }
    case "truefalse":
      return q.value ? "true" : "false";
    case "numeric":
      return join(q.key.raw.map((r) => (q.key.unit ? `${r} ${q.key.unit}` : r)));
    case "short":
      return join([...q.key.accept, ...q.key.patterns.map((p) => `/${p}/`)]);
    case "blanks":
      return join(q.blanks.map((b, i) => `${i + 1}: ${b.kind === "text" ? b.answers.join(" / ") : b.raw}`));
    case "fields": {
      const keyed = q.fields.filter((f) => f.key !== null);
      if (keyed.length === 0) return null;
      return join(
        keyed.map((f) => {
          const k = f.key;
          const value = k?.kind === "numeric" ? k.raw.join(" / ") : (k?.accept.join(" / ") ?? "");
          return `${one(f.label)}: ${value}`;
        }),
      );
    }
    case "ordering":
      return q.items.map((t, i) => `${i + 1}. ${one(t.text)}`).join(" ");
    case "matching":
      return join(q.pairs.map((p) => `${one(p.left)} - ${one(p.right)}`));
    case "essay":
    case "code":
    case "scale":
      return null;
  }
}
