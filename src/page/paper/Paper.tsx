import type { ComponentChildren } from "preact";
import type { PaperMessages } from "../../core/i18n/paper";
import { Html } from "../questions/shared";
import type { PaperData, PaperPart, PaperQuestion } from "./data";

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
function body(q: PaperQuestion, t: T): { head: ComponentChildren; rest: ComponentChildren } {
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

function Question({ q, t }: { q: PaperQuestion; t: T }) {
  const { head, rest } = body(q, t);
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
    </section>
  );
}

function Header({ d, t }: { d: PaperData; t: T }) {
  const facts = [
    d.time === null ? null : t.timeAllowed(d.time),
    d.total === null ? null : t.total(d.total),
    `${t.version} ${d.version}`,
  ].filter((x) => x !== null);
  return (
    <table class="box-table head">
      <tbody>
        <tr>
          <td rowSpan={2} class="title-cell">
            <div class="title">{d.title}</div>
            <div class="facts">{facts.join(" · ")}</div>
            {d.code === null ? null : (
              <div class="facts">
                {t.paperCode}: <b>{d.code}</b>
              </div>
            )}
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

function Sheet({ d, t }: { d: PaperData; t: T }) {
  const sheet = d.sheet;
  if (sheet === null) return null;
  const rows: number[][] = [];
  for (let i = 0; i < sheet.numbers.length; i += 10) rows.push(sheet.numbers.slice(i, i + 10));
  return (
    <div class="sheet">
      <div class="heading">{t.answerSheet}</div>
      <div class="note">{sheet.note}</div>
      {d.code === null ? null : (
        <div class="code-box">
          {t.paperCode}: <span class="box wide" />
        </div>
      )}
      <div class="grid">
        {rows.flatMap((nums, r) => {
          const slots = Array.from({ length: 10 }, (_, i) => nums[i] ?? null);
          return [
            ...slots.map((n, i) => (
              <div class={n === null ? "gn gx" : "gn"} key={`n${r}-${i}`}>
                {n}
              </div>
            )),
            ...slots.map((n, i) => <div class={n === null ? "gb gx" : "gb"} key={`b${r}-${i}`} />),
          ];
        })}
      </div>
    </div>
  );
}

export function Paper({ d, t }: { d: PaperData; t: T }) {
  return (
    <main class="paper">
      <Header d={d} t={t} />
      <Marker d={d} t={t} />
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
            <Question q={q} t={t} key={q.number} />
          ))}
        </div>
      ))}
    </main>
  );
}
