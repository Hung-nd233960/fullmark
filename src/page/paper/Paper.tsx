import type { ComponentChildren } from "preact";
import type { PaperMessages } from "../../core/i18n/paper";
import { Html } from "../questions/shared";
import type { KeyEntry, PaperData, PaperPart, PaperQuestion, RubricView } from "./data";

type T = PaperMessages;

const letter = (i: number): string => String.fromCharCode(65 + i);
const lower = (i: number): string => String.fromCharCode(97 + i);

/** The number runs into the first paragraph of the prompt ("Question 1. Which signal…"); else it stands on its own line. */
function withNumber(html: string, label: string): string {
  const run = `<b class="num">${label.replaceAll("&", "&amp;").replaceAll("<", "&lt;")}</b> `;
  return html.startsWith("<p>") ? `<p>${run}${html.slice(3)}` : `<p>${run}</p>${html}`;
}

const Lines = ({ count, from = 0 }: { count: number; from?: number }) => (
  <div class="lines">
    {Array.from({ length: count - from }, (_, i) => (
      <div class="line" key={from + i} />
    ))}
  </div>
);

const Boxes = ({ count }: { count: number }) => (
  <>
    {Array.from({ length: count }, (_, i) => (
      <span class="ordbox" key={i}>
        <b>{i + 1}</b>
        <i class="box" />
      </span>
    ))}
  </>
);

/** What goes with the head (the number, the prompt and the start of the answer space) and what may follow on the next page. */
function body(q: PaperQuestion, t: T, study: boolean): { head: ComponentChildren; rest: ComponentChildren } {
  switch (q.type) {
    case "single":
    case "multi": {
      const option = (o: (typeof q.options)[number], i: number) => (
        <div class="opt" key={i}>
          <span class="letter">{letter(i)}.</span>
          <Html tag="span" html={o.html} />
          {o.line ? <span class="blank" /> : null}
        </div>
      );
      const cls = q.twoColumns ? "opts two" : "opts";
      return {
        head: (
          <>
            {q.type === "multi" ? <div class="note">{t.chooseAll}</div> : null}
            <div class={cls}>{q.options.slice(0, 2).map(option)}</div>
          </>
        ),
        rest: q.options.length > 2 ? <div class={cls}>{q.options.slice(2).map((o, i) => option(o, i + 2))}</div> : null,
      };
    }
    case "truefalse":
      return {
        head: (
          <div class="body tf">
            <span>
              {t.trueLetter}. {t.trueLabel}
            </span>
            <span>
              {t.falseLetter}. {t.falseLabel}
            </span>
          </div>
        ),
        rest: null,
      };
    case "short":
      return { head: <div class="short line" />, rest: null };
    case "blanks":
      return { head: null, rest: null };
    case "numeric":
      return {
        head: (
          <div class="body answer">
            {t.answer}: <span class="box wide" />
            {q.unit === "" ? null : <span class="unit">{q.unit}</span>}
          </div>
        ),
        rest: null,
      };
    case "fields": {
      const row = (label: string, i: number) => (
        <div class="field" key={i}>
          <Html tag="span" class="label" html={label} />
          <span class="line" />
        </div>
      );
      return {
        head: <div class="fields">{q.fields.slice(0, 1).map(row)}</div>,
        rest: <div class="fields">{q.fields.slice(1).map((f, i) => row(f, i + 1))}</div>,
      };
    }
    case "scale":
      return {
        head: (
          <div class="body scale">
            {q.points.map((p) => (
              <div class="tick" key={p.value}>
                <i class="box" />
                <b>{p.value}</b>
                {p.labelHtml === null ? null : <Html tag="span" class="tick-label" html={p.labelHtml} />}
              </div>
            ))}
          </div>
        ),
        rest: null,
      };
    case "ordering":
      return {
        head: (
          <>
            <div class="opts">
              {q.items.map((html, i) => (
                <div class="opt" key={i}>
                  <span class="letter">{letter(i)}.</span>
                  <Html tag="span" html={html} />
                </div>
              ))}
            </div>
            <div class="body order">
              <Boxes count={q.items.length} />
            </div>
          </>
        ),
        rest: null,
      };
    case "matching": {
      const rows = Math.max(q.lefts.length, q.rights.length);
      const row = (i: number) => (
        <tr key={i}>
          <td>
            {q.lefts[i] === undefined ? null : (
              <>
                <span class="letter">{i + 1}.</span>
                <Html tag="span" html={q.lefts[i] as string} />
              </>
            )}
          </td>
          <td>
            {q.rights[i] === undefined ? null : (
              <>
                <span class="letter">{lower(i)}.</span>
                <Html tag="span" html={q.rights[i] as string} />
              </>
            )}
          </td>
        </tr>
      );
      const indices = Array.from({ length: rows }, (_, i) => i);
      return {
        head: (
          <div class="body">
            <table class="grid-table">
              <tbody>{indices.slice(0, 1).map(row)}</tbody>
            </table>
          </div>
        ),
        rest: (
          <>
            {rows > 1 ? (
              <div class="body">
                <table class="grid-table more">
                  <tbody>{indices.slice(1).map(row)}</tbody>
                </table>
              </div>
            ) : null}
            <div class="body links">
              {q.lefts.map((_, i) => (
                <span class="link" key={i}>
                  {i + 1} → <span class="blank short-blank" />
                </span>
              ))}
            </div>
          </>
        ),
      };
    }
    case "essay":
    case "code":
      // a study sheet has no ruled lines: nobody writes on it
      if (study) {
        return { head: q.starterHtml === null ? null : <Html class="body starter" html={q.starterHtml} />, rest: null };
      }
      return {
        head: (
          <>
            {q.starterHtml === null ? null : <Html class="body starter" html={q.starterHtml} />}
            <Lines count={Math.min(3, q.lines)} />
          </>
        ),
        rest: q.lines > 3 ? <Lines count={q.lines} from={3} /> : null,
      };
  }
}

/** An answer cell: the answer's lines, the partial-credit note after them, then the explanation. */
function AnswerCell({ k }: { k: KeyEntry }) {
  return (
    <>
      {k.lines.map((line, i) => (
        <div class="ans" key={i}>
          {line}
          {i === k.lines.length - 1 && k.note !== null ? <span class="pnote"> ({k.note})</span> : null}
        </div>
      ))}
      {k.explanationHtml === null ? null : <Html class="expl" html={k.explanationHtml} />}
    </>
  );
}

/** A rubric as a table (additive, banded) or a list (holistic); a preset by its name and the names of its criteria. */
function RubricTable({ r, t }: { r: RubricView; t: T }) {
  const valueHead = r.mode === "additive" ? t.pointsColumn : t.weight;
  const hasValues = r.rows.some((row) => row.value !== null);
  return (
    <>
      {r.preset === null ? null : <div class="preset">{r.preset}</div>}
      {r.mode === "holistic" ? (
        r.rows.length === 0 ? null : (
          <ul class="criteria">
            {r.rows.map((row, i) => (
              <li key={i} dangerouslySetInnerHTML={{ __html: row.html }} />
            ))}
          </ul>
        )
      ) : (
        <table class="box-table crit">
          <thead>
            <tr>
              <th class="left">{t.criterion}</th>
              {hasValues ? <th class="val">{valueHead}</th> : null}
            </tr>
          </thead>
          <tbody>
            {r.rows.map((row, i) => (
              <tr key={i}>
                <td dangerouslySetInnerHTML={{ __html: row.html }} />
                {hasValues ? <td class="n">{row.value}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {r.line === null ? null : <div class="scale-line">{r.line}</div>}
    </>
  );
}

/** The study sheet's block under a question: ANSWER, the answer, the explanation, the rubric and the sample answer. */
function AnswerBlock({ k, t }: { k: KeyEntry; t: T }) {
  return (
    <div class="answer-block">
      <div class="label">{t.answer}</div>
      <AnswerCell k={k} />
      {k.rubric === null ? null : (
        <div class="sub">
          <div class="label">{t.rubric}</div>
          <RubricTable r={k.rubric} t={t} />
        </div>
      )}
      {k.sampleHtml === null ? null : (
        <div class="sub">
          <div class="label">{t.sampleAnswer}</div>
          <Html class="sample" html={k.sampleHtml} />
        </div>
      )}
    </div>
  );
}

function Question({ q, t, study }: { q: PaperQuestion; t: T; study: boolean }) {
  const { head, rest } = body(q, t, study);
  return (
    <section class="q">
      <div class="q-head">
        <div class="q-title">
          <Html class="prompt" html={withNumber(q.promptHtml, t.question(q.number))} />
          {q.pointsLabel === null ? null : <span class="pts">({q.pointsLabel})</span>}
        </div>
        {head}
      </div>
      {rest}
      {study && q.key !== undefined ? <AnswerBlock k={q.key} t={t} /> : null}
    </section>
  );
}

const versionLine = (d: PaperData, t: T): string => `${d.title} · ${t.version} ${d.version}`;

/** A study sheet's head: nobody sits it, so no name boxes and no marker's table. */
function StudyHead({ d, t }: { d: PaperData; t: T }) {
  return (
    <header class="study-head">
      <h1 class="title">{d.title}</h1>
      <Facts d={d} t={t} />
    </header>
  );
}

function Header({ d, t }: { d: PaperData; t: T }) {
  return (
    <table class="box-table head">
      <tbody>
        <tr>
          <td rowSpan={2} class="title-cell">
            <h1 class="title">{d.title}</h1>
            <Facts d={d} t={t} />
          </td>
          <td>{t.name}:</td>
        </tr>
        <tr>
          <td>
            {t.class}: <span class="gap" />
            {t.date}:
          </td>
        </tr>
        <tr>
          <td>{t.studentId}:</td>
          <td>{t.signature}:</td>
        </tr>
      </tbody>
    </table>
  );
}

function Facts({ d, t }: { d: PaperData; t: T }) {
  const facts = [
    d.time === null ? null : t.timeAllowed(d.time),
    d.total === null ? null : t.total(d.total),
    `${t.version} ${d.version}`,
  ].filter((x) => x !== null);
  return (
    <>
      <div class="facts">{facts.join(" · ")}</div>
      {d.code === null ? null : (
        <div class="facts">
          {t.paperCode}: <b>{d.code}</b>
        </div>
      )}
      {d.materials === null ? null : <div class="facts small">{t.materialsAfter}</div>}
    </>
  );
}

/** One table of the marker's marks: a column per part, Maximum and an empty Score; more than six parts wrap into another. */
function Marker({ d, t }: { d: PaperData; t: T }) {
  const titled = d.parts.length > 1 || d.parts[0]?.title != null;
  const groups: PaperPart[][] = [];
  if (titled) for (let i = 0; i < d.parts.length; i += 6) groups.push(d.parts.slice(i, i + 6));
  else groups.push([]);
  return (
    <>
      {groups.map((parts, g) => {
        const last = g === groups.length - 1;
        return (
          <table class="box-table marker" key={g}>
            <thead>
              <tr>
                <th class="left">{t.forMarker}</th>
                {parts.map((p, i) => (
                  <th key={i}>{p.title}</th>
                ))}
                {last ? <th>{t.totalColumn}</th> : null}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{t.maximum}</td>
                {parts.map((p, i) => (
                  <td class="n" key={i}>
                    {p.max}
                  </td>
                ))}
                {last ? <td class="n total">{d.totalMax}</td> : null}
              </tr>
              <tr class="score">
                <td>{t.score}</td>
                {parts.map((_, i) => (
                  <td class="n" key={i}>
                    {" "}
                  </td>
                ))}
                {last ? <td class="n">{" "}</td> : null}
              </tr>
            </tbody>
          </table>
        );
      })}
    </>
  );
}

/** The grid of numbered boxes: empty on the answer sheet, with the letters in them on the key. */
function Grid({ numbers, fill }: { numbers: number[]; fill: (n: number) => string }) {
  const rows: number[][] = [];
  for (let i = 0; i < numbers.length; i += 10) rows.push(numbers.slice(i, i + 10));
  return (
    <div class="grid">
      {rows.flatMap((nums, r) => {
        const slots = Array.from({ length: 10 }, (_, i) => nums[i] ?? null);
        return [
          ...slots.map((n, i) => (
            <div class={n === null ? "gn gx" : "gn"} key={`n${r}-${i}`}>
              {n}
            </div>
          )),
          ...slots.map((n, i) => (
            <div class={n === null ? "gb gx" : "gb"} key={`b${r}-${i}`}>
              {n === null ? null : fill(n)}
            </div>
          )),
        ];
      })}
    </div>
  );
}

function Sheet({ d, t }: { d: PaperData; t: T }) {
  const sheet = d.sheet;
  if (sheet === null) return null;
  return (
    <div class="sheet">
      <div class="heading">{t.answerSheet}</div>
      <div class="note">{sheet.note}</div>
      {d.code === null ? null : (
        <div class="code-box">
          {t.paperCode}: <span class="box wide" />
        </div>
      )}
      <Grid numbers={sheet.numbers} fill={() => ""} />
    </div>
  );
}

/** The head of a page after the paper: its title at the left, the quiz and its version at the right, a 2px rule. */
function PageHead({ title, d, t }: { title: string; d: PaperData; t: T }) {
  return (
    <div class="page-head">
      <span class="page-title">{title}</span>
      <span>{versionLine(d, t)}</span>
    </div>
  );
}

/** The materials page: on a new page after the last question, before the key, so the key can be removed alone. */
function MaterialsPage({ d, t }: { d: PaperData; t: T }) {
  if (d.materials === null) return null;
  return (
    <section class="materials-page">
      <PageHead title={t.materials} d={d} t={t} />
      <div class="detach">{t.detach}</div>
      {d.materials.map((m, i) => (
        <section class="mat" key={i}>
          <h2 class="heading">{m.name}</h2>
          <Html class="mat-body" html={m.html} />
        </section>
      ))}
    </section>
  );
}

/** The answer key: the sheet's questions in the grid, the others in a table, then each rubric. */
function KeyPage({ d, t }: { d: PaperData; t: T }) {
  const all = d.parts.flatMap((p) => p.questions);
  const onGrid = new Set(d.sheet?.numbers ?? []);
  const gridded = all.filter((q) => onGrid.has(q.number));
  const rest = all.filter((q) => !onGrid.has(q.number));
  const explained = gridded.filter((q) => q.key?.explanationHtml);
  const head = d.code === null ? t.answerKey : t.answerKeyCode(d.code);
  return (
    <section class="key-page">
      <PageHead title={head} d={d} t={t} />
      {d.sheet === null ? null : (
        <>
          <div class="heading">{t.sheetQuestions}</div>
          <Grid numbers={d.sheet.numbers} fill={(n) => gridded.find((q) => q.number === n)?.key?.sheet ?? ""} />
          {explained.length === 0 ? null : (
            <div class="explained">
              <div class="heading">{t.explanations}</div>
              {explained.map((q) => (
                <div class="expl-row" key={q.number}>
                  <b>{q.number}.</b> <Html tag="span" html={q.key?.explanationHtml ?? ""} />
                </div>
              ))}
            </div>
          )}
          {rest.length === 0 ? null : <div class="heading">{t.otherQuestions}</div>}
        </>
      )}
      {rest.length === 0 ? null : (
        <table class="box-table key-table">
          <thead>
            <tr>
              <th class="no">{t.numberColumn}</th>
              <th class="left">{t.answer}</th>
              <th class="pts">{t.pointsColumn}</th>
            </tr>
          </thead>
          <tbody>
            {rest.map((q) =>
              q.key === undefined ? null : (
                <tr key={q.number}>
                  <td class="n">{q.number}</td>
                  <td>
                    <AnswerCell k={q.key} />
                  </td>
                  <td class="n">{q.key.points ?? "—"}</td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      )}
      {all.map((q) =>
        q.key?.rubric ? (
          <section class="mark-block" key={q.number}>
            <div class="heading">
              {t.question(q.number)} {t.rubric}
              {q.pointsLabel === null ? null : <span class="part-points"> ({q.pointsLabel})</span>}
            </div>
            <RubricTable r={q.key.rubric} t={t} />
            {q.key.sampleHtml === null ? null : (
              <div class="sample-block">
                <div class="label">{t.sampleAnswer}</div>
                <Html class="sample" html={q.key.sampleHtml} />
              </div>
            )}
          </section>
        ) : null,
      )}
    </section>
  );
}

export function Paper({ d, t }: { d: PaperData; t: T }) {
  const study = d.answers === "inline";
  return (
    <main class="paper">
      {study ? <StudyHead d={d} t={t} /> : <Header d={d} t={t} />}
      {study ? null : <Marker d={d} t={t} />}
      <Sheet d={d} t={t} />
      {d.parts.map((part, i) => (
        <div class="part-block" key={i}>
          {part.title === null ? null : (
            <h2 class="part">
              {part.title} <span class="part-points">({part.pointsLabel})</span>
            </h2>
          )}
          {part.introHtml === "" ? null : <Html class="intro" html={part.introHtml} />}
          {part.questions.map((q) => (
            <Question q={q} t={t} study={study} key={q.number} />
          ))}
        </div>
      ))}
      <MaterialsPage d={d} t={t} />
      {d.answers === "key" ? <KeyPage d={d} t={t} /> : null}
    </main>
  );
}
