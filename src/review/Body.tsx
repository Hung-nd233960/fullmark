import type { ReviewMessages } from "../core/i18n/review";
import type { Question } from "../core/ir";
import { type KeyBlob, openKey, type PageQuestion, type PageQuiz } from "../page/data";
import { BlanksPrompt } from "../page/questions/Blanks";
import { ChoiceList } from "../page/questions/ChoiceList";
import { Scale } from "../page/questions/Scale";
import { acceptedNumber, type Ctx, Html, messagesFor, type PageMessages } from "../page/questions/shared";
import { TrueFalse } from "../page/questions/TrueFalse";
import { num } from "../page/results";

type R = ReviewMessages;

/**
 * A question in its key state (COMMANDS.md, `quiz review`, "Verdict first"; G55): the page's own components in their
 * after-Submit state, with no answer, so only the key's marks show. Choices are in source order.
 */
export type Keyed = { page: PageQuiz; key: KeyBlob; byId: Map<string, Question> };

export function keyedOf(page: PageQuiz): Keyed {
  const key = openKey(page);
  const byId = new Map<string, Question>();
  for (const s of key.quiz.sections) for (const q of s.questions) byId.set(q.id, q);
  return { page, key, byId };
}

const none = (): void => undefined;

function ctxOf(k: Keyed, q: PageQuestion): Ctx {
  return {
    t: messagesFor(k.page),
    quiz: k.page,
    name: `${k.page.id}/${q.id}`,
    answer: null,
    submitted: true,
    started: true,
    order: undefined,
    dataOrder: k.key.dataOrder[q.id],
    result: undefined,
    keyed: k.byId.get(q.id),
    sample: k.key.samples[q.id],
    grade: undefined,
    set: none,
  };
}

/** One accepted value in the page's `Shown` box, with no "your answer" beside it. */
function Accepted({ label, children }: { label: string; children: preact.ComponentChildren }) {
  return (
    <dl class="fm-shown fm-key-shown">
      <div class="fm-shown-box fm-shown-accepted">
        <dt>{label}</dt>
        <dd>{children}</dd>
      </div>
    </dl>
  );
}

/** A text key: every accepted answer, and the patterns as they are written in the source (G40). */
function TextKey({ accept, patterns, r }: { accept: readonly string[]; patterns: readonly string[]; r: R }) {
  return (
    <>
      {accept.length > 0 ? <Accepted label={r.accepted}>{accept.join(" · ")}</Accepted> : null}
      {patterns.length > 0 ? (
        <Accepted label={r.patterns}>
          {patterns.map((p, i) => (
            <code key={i} class="fm-key-pattern">
              {p}
            </code>
          ))}
        </Accepted>
      ) : null}
    </>
  );
}

function Rubric({ q, c, r }: { q: Extract<PageQuestion, { type: "essay" | "code" }>; c: Ctx; r: R }) {
  if (q.rubric === null || q.rubric.length === 0) return null;
  const total = q.rubric.every((x) => x.points !== null) ? q.rubric.reduce((sum, x) => sum + (x.points ?? 0), 0) : null;
  return (
    <table class="fm-key-rubric">
      <caption>{total === null ? c.t.rubric : r.rubricTotal(num(total, c.quiz.uiLang))}</caption>
      <thead>
        <tr>
          <th scope="col">{r.criterion}</th>
          <th scope="col" class="fm-key-num">
            {r.points}
          </th>
        </tr>
      </thead>
      <tbody>
        {q.rubric.map((x, i) => (
          <tr key={i}>
            <td>
              <Html html={x.html} tag="span" />
            </td>
            <td class="fm-key-num">{x.points === null ? "" : num(x.points, c.quiz.uiLang)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** What each type shows of its key. */
export function KeyBody({ k, q, r }: { k: Keyed; q: PageQuestion; r: R }) {
  const c = ctxOf(k, q);
  const t: PageMessages = c.t;
  const keyed = c.keyed;
  switch (q.type) {
    case "single":
      return <ChoiceList q={q} c={c} multi={false} />;
    case "multi":
      return <ChoiceList q={q} c={c} multi />;
    case "truefalse":
      return <TrueFalse q={q} c={c} />;
    case "scale":
      return <Scale q={q} c={c} />;
    case "numeric":
      return keyed?.type === "numeric" ? (
        <Accepted label={r.accepted}>{acceptedNumber(t, keyed.key, k.page.uiLang)}</Accepted>
      ) : null;
    case "short":
      return keyed?.type === "short" ? <TextKey accept={keyed.key.accept} patterns={keyed.key.patterns} r={r} /> : null;
    case "blanks":
      return (
        <div>
          <BlanksPrompt q={q} c={c} />
          {keyed?.type === "blanks" ? (
            <ul class="fm-blank-results fm-key-blanks">
              {keyed.blanks.map((b, i) => (
                <li key={i}>
                  {t.blankLabel(i + 1)}:{" "}
                  <strong>
                    {b.kind === "numeric"
                      ? acceptedNumber(
                          t,
                          { raw: [b.raw], values: [b.value], tolerance: b.tolerance, relTolerance: null },
                          k.page.uiLang,
                        )
                      : b.answers.join(" · ")}
                  </strong>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      );
    case "fields":
      return (
        <div class="fm-fields fm-key-fields">
          {q.fields.map((f, i) => {
            const key = keyed?.type === "fields" ? (keyed.fields[i]?.key ?? null) : null;
            return (
              <div key={i} class="fm-field">
                <Html html={f.labelHtml} tag="span" class="fm-field-label" />
                {key === null ? (
                  <p class="fm-key-unscored">{r.unscored}</p>
                ) : key.kind === "numeric" ? (
                  <Accepted label={r.accepted}>{acceptedNumber(t, key, k.page.uiLang)}</Accepted>
                ) : (
                  <TextKey accept={key.accept} patterns={key.patterns} r={r} />
                )}
              </div>
            );
          })}
        </div>
      );
    case "ordering":
      return (
        <ol class="fm-choices fm-key-order">
          {q.items.map((item, i) => (
            <li key={i} class="fm-choice" data-correct="true">
              <div class="fm-key-row">
                <span class="fm-letter" aria-hidden="true">
                  {i + 1}
                </span>
                <Html html={item.html} tag="span" class="fm-choice-text" />
              </div>
            </li>
          ))}
        </ol>
      );
    case "matching":
      return (
        <ul class="fm-choices fm-key-pairs">
          {q.lefts.map((left, i) => (
            <li key={i} class="fm-choice" data-correct="true">
              <div class="fm-key-row">
                <Html html={left} tag="span" class="fm-choice-text" />
                <span class="fm-key-arrow" aria-hidden="true">
                  →
                </span>
                <Html html={q.rights[i]?.html ?? ""} tag="span" class="fm-choice-text" />
              </div>
            </li>
          ))}
        </ul>
      );
    case "essay":
    case "code":
      return (
        <div class="fm-open fm-key-open">
          <Rubric q={q} c={c} r={r} />
          {c.sample !== undefined ? (
            <div class="fm-sample">
              <strong>{t.sampleAnswer}</strong>
              <Html html={c.sample} />
            </div>
          ) : null}
        </div>
      );
  }
}
