/**
 * The review form's words (COMMANDS.md, `quiz review`; the Review boards, `LANG`), in the language of the quiz's
 * `ui_lang`. They are a file of their own, not a group of the `en` and `vi` catalogs: the page runtime bundles those
 * whole, and these words belong to `dist/review.js` alone, so a shared page stays byte for byte what it was.
 */
import { shortDate } from "../review/counts";

/** `28/10`, from the date part of an ISO time as it was written (the `vi` form writes it so, as the ReviewSince board does). */
const dayMonth = (iso: string): string => {
  const m = /^\d{4}-(\d\d)-(\d\d)/.exec(iso);
  return m ? `${Number(m[2])}/${Number(m[1])}` : iso;
};

export const reviewEn = {
  label: "Review",
  keepRest: "Keep the rest",
  keepRestTitle: "Mark every question not judged yet as Keep, and finish",
  finish: "Finish",
  judged: (judged: number, total: number) => `Judged ${judged} of ${total}`,
  judgedAria: "Judged",
  position: (n: number, total: number) => `Question ${n} of ${total}`,
  verdictWord: { keep: "keep", fix: "fix", drop: "drop" },
  notJudgedWord: "not judged",
  currentWord: "current",
  verdictLabel: "Your verdict",
  keep: "Keep",
  fix: "Fix",
  drop: "Drop",
  notJudged: "Not judged",
  reasonCount: (n: number) => `${n} ${n === 1 ? "reason" : "reasons"}`,
  whyFix: "What needs fixing?",
  whyDrop: "Why drop it?",
  pickOne: "Pick at least one reason.",
  noteOptional: "Note (optional)",
  noteRequired: "Note (required with Other)",
  noteMissing: "Say what is wrong: a note is required with Other.",
  reason: {
    "key-wrong": "Answer key wrong",
    unclear: "Unclear",
    "rubric-loose": "Rubric too loose",
    "points-misallocated": "Points misallocated",
    "criterion-unclear": "Criterion unclear",
    other: "Other",
    duplicate: "Duplicate",
    "off-scope": "Off scope",
    "too-easy": "Too easy",
  },
  accepted: "Accepted answer",
  patterns: "Accepted patterns",
  unscored: "Not scored",
  criterion: "Criterion",
  points: "Points",
  rubricTotal: (points: string) => `Rubric · ${points} ${points === "1" ? "point" : "points"}`,
  cellLabel: (n: number, word: string, current: boolean) => `Question ${n}, ${word}${current ? ", current" : ""}`,
  partCount: (judged: number, total: number) => `${judged} of ${total} judged`,
  /** the stacked map (Review and ReviewSince boards): a part's heading line, and its tab's accessible name (G67) */
  partStats: (judged: number, total: number, fix: number, drop: number) =>
    total === 0
      ? "nothing asked again"
      : `${judged} of ${total} judged${fix > 0 ? ` · ${fix} fix` : ""}${drop > 0 ? ` · ${drop} drop` : ""}`,
  partTab: (n: number, title: string | null, judged: number, total: number, fix: number, drop: number) =>
    `Part ${n}${title === null ? "" : `, ${title}`}: ${
      total === 0
        ? "nothing asked again"
        : `${judged} of ${total} judged${fix > 0 ? `, ${fix} fix` : ""}${drop > 0 ? `, ${drop} drop` : ""}`
    }`,
  materialsKey: "materials",
  /** the compact top bar on a phone: "Review: TITLE" over "Judged 15 of 32 · Question 20" */
  phoneTitle: (title: string) => `Review: ${title}`,
  keysLabel: "Keys",
  nextKey: "next not judged",
  dlgTitle: (n: number) => `${n} ${n === 1 ? "question" : "questions"} not judged`,
  dlgRest: "Keep the rest marks every question you have not judged as Keep, then finishes the review.",
  dlgFinish: "You can go back to the first one, or keep them all and finish now.",
  /** the note under both dialogs, in three parts: the command between them is a code span that does not wrap (G62) */
  dlgNote: ["They are written as Keep, marked as not looked at; a later ", "quiz review", " can still judge them."] as [
    string,
    string,
    string,
  ],
  matchesNothing: "Matches nothing",
  /** `--since` (ReviewSince board): the date is the review's `reviewedAt`, written as `inspect --review` writes it */
  date: shortDate,
  askedAgain: (n: number, date: string) =>
    `Asked again: ${n} ${n === 1 ? "question" : "questions"} new or changed since your review of ${date}`,
  earlier: (date: string) => `Your verdict on ${date}`,
  changedSince: "What changed since",
  diffAria: (n: number, date: string) => `Changes to question ${n} since ${date}`,
  keptChanged: "Changed since; a Keep does not store the earlier text",
  notLookedAt: "not looked at",
  notAsked: "not asked again",
  back: (n: number) => `Go back to question ${n}`,
  cancel: "Cancel",
  markKeep: "Mark them Keep and finish",
  held: (n: number) =>
    `${n} ${n === 1 ? "question needs" : "questions need"} a reason or a note before the review can be saved:`,
  saveFailed: (why: string) => `The review was not saved: ${why}`,
  saved: "Review saved",
  doneLine: (out: string, keep: number, assumed: number, fix: number, drop: number) =>
    `${out}: ${keep} keep${assumed > 0 ? ` (${assumed} not looked at)` : ""}, ${fix} fix, ${drop} drop.`,
  closed: "fullmark has closed the form, so you can close this tab. Fix the questions you marked, then run",
};

export type ReviewMessages = typeof reviewEn;

export const reviewVi = {
  label: "Rà soát",
  keepRest: "Giữ các câu còn lại",
  keepRestTitle: "Đánh dấu Giữ mọi câu chưa xét, rồi hoàn tất",
  finish: "Hoàn tất",
  judged: (judged: number, total: number) => `Đã xét ${judged} / ${total}`,
  judgedAria: "Đã xét",
  position: (n: number, total: number) => `Câu ${n} / ${total}`,
  verdictWord: { keep: "giữ", fix: "sửa", drop: "bỏ" },
  notJudgedWord: "chưa xét",
  currentWord: "đang xem",
  verdictLabel: "Đánh giá của bạn",
  keep: "Giữ",
  fix: "Sửa",
  drop: "Bỏ",
  notJudged: "Chưa xét",
  reasonCount: (n: number) => `${n} lý do`,
  whyFix: "Cần sửa gì?",
  whyDrop: "Vì sao bỏ?",
  pickOne: "Chọn ít nhất một lý do.",
  noteOptional: "Ghi chú (không bắt buộc)",
  noteRequired: "Ghi chú (bắt buộc khi chọn Khác)",
  noteMissing: "Hãy nói rõ vấn đề: chọn Khác thì cần có ghi chú.",
  reason: {
    "key-wrong": "Đáp án sai",
    unclear: "Chưa rõ ràng",
    "rubric-loose": "Tiêu chí chấm quá lỏng",
    "points-misallocated": "Chia điểm chưa hợp lý",
    "criterion-unclear": "Tiêu chí chưa rõ",
    other: "Khác",
    duplicate: "Trùng lặp",
    "off-scope": "Ngoài phạm vi",
    "too-easy": "Quá dễ",
  },
  accepted: "Đáp án chấp nhận",
  patterns: "Mẫu chấp nhận",
  unscored: "Không tính điểm",
  criterion: "Tiêu chí",
  points: "Điểm",
  rubricTotal: (points: string) => `Tiêu chí chấm · ${points} điểm`,
  cellLabel: (n: number, word: string, current: boolean) => `Câu ${n}, ${word}${current ? ", đang xem" : ""}`,
  partCount: (judged: number, total: number) => `đã xét ${judged} / ${total}`,
  partStats: (judged: number, total: number, fix: number, drop: number) =>
    total === 0
      ? "không hỏi lại câu nào"
      : `đã xét ${judged} / ${total}${fix > 0 ? ` · ${fix} sửa` : ""}${drop > 0 ? ` · ${drop} bỏ` : ""}`,
  partTab: (n: number, title: string | null, judged: number, total: number, fix: number, drop: number) =>
    `Phần ${n}${title === null ? "" : `, ${title}`}: ${
      total === 0
        ? "không hỏi lại câu nào"
        : `đã xét ${judged} / ${total}${fix > 0 ? `, ${fix} sửa` : ""}${drop > 0 ? `, ${drop} bỏ` : ""}`
    }`,
  materialsKey: "tài liệu",
  phoneTitle: (title: string) => `Rà soát: ${title}`,
  keysLabel: "Phím tắt",
  nextKey: "câu chưa xét tiếp theo",
  dlgTitle: (n: number) => `${n} câu chưa xét`,
  dlgRest: "Giữ các câu còn lại sẽ đánh dấu Giữ cho mọi câu bạn chưa xét, rồi hoàn tất bản rà soát.",
  dlgFinish: "Bạn có thể quay lại câu đầu tiên, hoặc giữ tất cả và hoàn tất ngay.",
  dlgNote: ["Các câu này được ghi là Giữ, kèm dấu chưa xem; lần ", "quiz review", " sau vẫn có thể xét lại."],
  matchesNothing: "Không ghép với mục nào",
  date: dayMonth,
  askedAgain: (n: number, date: string) => `Hỏi lại: ${n} câu mới hoặc đã đổi kể từ lần rà soát ngày ${date}`,
  earlier: (date: string) => `Đánh giá của bạn ngày ${date}`,
  changedSince: "Những gì đã đổi kể từ đó",
  diffAria: (n: number, date: string) => `Thay đổi của câu ${n} kể từ ngày ${date}`,
  keptChanged: "Đã đổi kể từ đó; Giữ không lưu bản trước",
  notLookedAt: "chưa xem",
  notAsked: "không hỏi lại",
  back: (n: number) => `Quay lại câu ${n}`,
  cancel: "Huỷ",
  markKeep: "Đánh dấu Giữ và hoàn tất",
  held: (n: number) => `${n} câu cần có lý do hoặc ghi chú trước khi lưu được bản rà soát:`,
  saveFailed: (why: string) => `Chưa lưu được bản rà soát: ${why}`,
  saved: "Đã lưu bản rà soát",
  doneLine: (out: string, keep: number, assumed: number, fix: number, drop: number) =>
    `${out}: ${keep} giữ${assumed > 0 ? ` (${assumed} chưa xem)` : ""}, ${fix} sửa, ${drop} bỏ.`,
  closed: "fullmark đã đóng biểu mẫu, bạn có thể đóng thẻ này. Sửa các câu đã đánh dấu, rồi chạy",
} satisfies ReviewMessages;
