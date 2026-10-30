import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { messagesFor } from "../../src/page/questions/shared";
import { submitSummary } from "../../src/page/SubmitDialog";
import { setup } from "../helpers/page";

const fixture = (name: string) => readFileSync(resolve(import.meta.dirname, "..", "fixtures", "page", name), "utf8");
const answer = (s: ReturnType<typeof setup>, question: string, a: Record<string, unknown> = { choice: 0 }) =>
  s.store.dispatch(s.id, { type: "answer", question, answer: a });
const lines = (s: ReturnType<typeof setup>) =>
  submitSummary(messagesFor(s.state().page), s.state()).map(
    (l) => `${l.kind}: ${l.text}${l.first ? ` -> ${l.first}` : ""}`,
  );

describe("the Submit dialog's summary", () => {
  it("a full attempt has only the answered line and the clock; a zero count is left out", () => {
    const s = setup(fixture("timed.md"));
    s.store.start(s.id, { seed: "seed0001" });
    const ids = s.state().attempt.value.plan.questions;
    for (const id of ids) answer(s, id);
    s.state().elapsed.value = 40;
    expect(lines(s)).toEqual([`answered: ${ids.length} of ${ids.length} answered`, "clock: 00:50 left on the clock"]);
  });

  it("a partial attempt counts not answered and flagged, and links to the first of each", () => {
    const s = setup(fixture("map.md"));
    s.store.start(s.id, { seed: "seed0001" });
    const plan = s.state().attempt.value.plan.questions;
    answer(s, plan[0] as string);
    answer(s, plan[2] as string);
    s.store.dispatch(s.id, { type: "flag", question: plan[3] as string });
    s.store.dispatch(s.id, { type: "flag", question: plan[1] as string });
    s.state().elapsed.value = 65;
    expect(lines(s)).toEqual([
      `answered: 2 of ${plan.length} answered`,
      `unanswered: ${plan.length - 2} not answered -> ${plan[1]}`,
      `flagged: 2 flagged -> ${plan[1]}`,
      "clock: 01:05 used",
    ]);
  });

  it("an instant-feedback question counts as answered once checked, and agrees with the status line", () => {
    const s = setup(fixture("instant.md"));
    s.store.start(s.id, { seed: "seed0001" });
    const plan = s.state().attempt.value.plan.questions;
    answer(s, "i1");
    s.store.dispatch(s.id, { type: "check", question: "i1" });
    const text = lines(s);
    expect(text[0]).toBe(`answered: 1 of ${plan.length} answered`);
    expect(s.html()).toContain(`1 of ${plan.length} answered`);
  });

  it("says it in Vietnamese, as the design gives the strings", () => {
    const s = setup(fixture("timed.md").replace("---\n", "---\nlang: vi\nui_lang: vi\n"));
    s.store.start(s.id, { seed: "seed0001" });
    const ids = s.state().attempt.value.plan.questions;
    answer(s, ids[0] as string);
    s.store.dispatch(s.id, { type: "flag", question: ids[0] as string });
    const t = messagesFor(s.state().page);
    expect(t.submitTitle).toBe("Nộp bài?");
    expect(t.submitBody).toBe("Sau khi nộp, bạn không thể sửa câu trả lời.");
    s.state().elapsed.value = 30;
    expect(lines(s)).toEqual([
      `answered: Đã trả lời 1 trên ${ids.length}`,
      `unanswered: ${ids.length - 1} câu chưa trả lời -> ${ids[1]}`,
      `flagged: 1 câu đã đánh dấu -> ${ids[0]}`,
      "clock: Còn 01:00",
    ]);
    expect(t.keepAnswering).toBe("Tiếp tục làm bài");
    expect(t.submitGoFirst).toBe("Đến câu đầu tiên");
  });
});
