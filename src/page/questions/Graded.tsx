import type { PageGradeDetail } from "../data";
import { dayOf } from "../replay";
import { num } from "../results";
import { type Ctx, Html } from "./shared";

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
          <table class="fm-grade-table">
            <thead>
              <tr>
                <th scope="col">{t.gradeCriterion}</th>
                {additive ? (
                  <>
                    <th scope="col" class="fm-grade-num">
                      {t.gradeAwarded}
                    </th>
                    <th scope="col" class="fm-grade-num">
                      {t.gradeMax}
                    </th>
                  </>
                ) : banded ? (
                  <th scope="col" class="fm-grade-num">
                    {t.gradeBand}
                  </th>
                ) : (
                  <th scope="col">{t.gradeVerdict}</th>
                )}
                {grade.mode === "holistic" ? null : <th scope="col">{t.gradeNote}</th>}
              </tr>
            </thead>
            <tbody>
              {grade.criteria.map((row, i) => (
                <tr key={i}>
                  <td class="fm-grade-name">
                    <Html html={row.html} tag="span" />
                  </td>
                  {additive ? (
                    <>
                      <td class="fm-grade-num">{row.earned === null ? "" : num(row.earned, lang)}</td>
                      <td class="fm-grade-num">{row.max === null ? "" : num(row.max, lang)}</td>
                    </>
                  ) : banded ? (
                    <td class="fm-grade-num">{row.band === null ? "" : num(row.band, lang)}</td>
                  ) : (
                    <td data-verdict={row.verdict ?? undefined}>
                      {row.verdict === null ? "" : t.gradeVerdicts[row.verdict]}
                    </td>
                  )}
                  {grade.mode === "holistic" ? null : <td class="fm-grade-note">{row.note ?? ""}</td>}
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
