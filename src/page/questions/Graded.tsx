import type { PageGradeDetail } from "../data";
import { dayOf } from "../replay";
import { num } from "../results";
import { type Ctx, Html } from "./shared";

/**
 * Explicit roles: under 520 px the CSS changes the table's `display`, and a browser then drops the table semantics of
 * what it no longer lays out as a table; the roles keep them. (Spread, so the linter does not read them as redundant.)
 */
const role = {
  table: { role: "table" },
  rowgroup: { role: "rowgroup" },
  row: { role: "row" },
  columnheader: { role: "columnheader" },
  cell: { role: "cell" },
} as const;

/**
 * What a grader gave an essay or code answer (a replay with a grades file): a table of the criteria, as the mode has
 * them, the grader's own words, and the line naming the grader and the day (TECHNICAL_DESIGN.md, section 6). The
 * numbers are the ones `applyGrades` worked out; nothing is added up here.
 */
export function GradeTable({ grade, c }: { grade: PageGradeDetail; c: Ctx }) {
  const { t } = c;
  const lang = c.quiz.uiLang;
  const at = dayOf(grade.grader.at);
  const date = at === null ? null : t.gradedOn(at.day, t.monthsShort[at.month - 1] ?? "", at.year);
  const additive = grade.mode === "additive";
  const banded = grade.mode === "banded";
  return (
    <div class="fm-grade" id={`${c.name}/grade`} data-grade-mode={grade.mode}>
      {grade.criteria.length > 0 ? (
        <div class="fm-grade-scroll">
          <table class="fm-grade-table" {...role.table}>
            <thead {...role.rowgroup}>
              <tr {...role.row}>
                <th {...role.columnheader} scope="col">
                  {t.gradeCriterion}
                </th>
                {additive ? (
                  <>
                    <th {...role.columnheader} scope="col" class="fm-grade-num">
                      {t.gradeAwarded}
                    </th>
                    <th {...role.columnheader} scope="col" class="fm-grade-num">
                      {t.gradeMax}
                    </th>
                  </>
                ) : banded ? (
                  <th {...role.columnheader} scope="col" class="fm-grade-num">
                    {t.gradeBand}
                  </th>
                ) : (
                  <th {...role.columnheader} scope="col">
                    {t.gradeVerdict}
                  </th>
                )}
                {grade.mode === "holistic" ? null : (
                  <th {...role.columnheader} scope="col">
                    {t.gradeNote}
                  </th>
                )}
              </tr>
            </thead>
            <tbody {...role.rowgroup}>
              {grade.criteria.map((row, i) => (
                <tr key={i} {...role.row}>
                  <td {...role.cell} class="fm-grade-name">
                    <Html html={row.html} tag="span" />
                  </td>
                  {additive ? (
                    <>
                      <td {...role.cell} class="fm-grade-num">
                        {row.earned === null ? "" : num(row.earned, lang)}
                      </td>
                      <td {...role.cell} class="fm-grade-num">
                        {row.max === null ? "" : num(row.max, lang)}
                      </td>
                    </>
                  ) : banded ? (
                    <td {...role.cell} class="fm-grade-num" data-label={t.gradeBand}>
                      {row.band === null ? "" : num(row.band, lang)}
                    </td>
                  ) : (
                    <td {...role.cell} data-verdict={row.verdict ?? undefined}>
                      {row.verdict === null ? "" : t.gradeVerdicts[row.verdict]}
                    </td>
                  )}
                  {grade.mode === "holistic" ? null : (
                    <td {...role.cell} class="fm-grade-note">
                      {row.note ?? ""}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {banded && grade.band !== null && grade.scaleMax !== null ? (
        <p class="fm-grade-band">{t.gradeOverallBand(num(grade.band, lang), num(grade.scaleMax, lang))}</p>
      ) : null}
      {grade.justification !== null || grade.improvement !== null ? (
        <div class="fm-feedback" data-feedback>
          {grade.justification !== null ? (
            <p class="fm-feedback-part">
              <strong class="fm-feedback-label">{t.gradeJustification}</strong> {grade.justification}
            </p>
          ) : null}
          {grade.improvement !== null ? (
            <p class="fm-feedback-part">
              <strong class="fm-feedback-label">{t.gradeImprovement}</strong> {grade.improvement}
            </p>
          ) : null}
        </div>
      ) : null}
      <p class="fm-grader" data-grader>
        {t.gradedBy(grade.grader.name, date, num(grade.earned, lang), num(grade.points, lang))}
      </p>
    </div>
  );
}
