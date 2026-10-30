import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clickToggle, DOUBLE_CLICK_WAIT } from "../../src/page/mapdom";

/** A heading's click waits out the double-click (TECHNICAL_DESIGN.md section 8, "Question map"). */
describe("clickToggle", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("a single click toggles after the wait, not before", () => {
    const toggle = vi.fn();
    clickToggle("a", 1, toggle);
    vi.advanceTimersByTime(DOUBLE_CLICK_WAIT - 1);
    expect(toggle).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(toggle).toHaveBeenCalledTimes(1);
  });

  it("a double-click never toggles", () => {
    const toggle = vi.fn();
    clickToggle("b", 1, toggle);
    vi.advanceTimersByTime(100);
    clickToggle("b", 2, toggle);
    vi.advanceTimersByTime(1000);
    expect(toggle).not.toHaveBeenCalled();
  });

  it("a click from the keyboard toggles at once", () => {
    const toggle = vi.fn();
    clickToggle("c", 0, toggle);
    expect(toggle).toHaveBeenCalledTimes(1);
  });

  it("two slow clicks toggle twice; parts do not cancel each other", () => {
    const one = vi.fn();
    const two = vi.fn();
    clickToggle("d", 1, one);
    clickToggle("e", 1, two);
    vi.advanceTimersByTime(DOUBLE_CLICK_WAIT);
    clickToggle("d", 1, one);
    vi.advanceTimersByTime(DOUBLE_CLICK_WAIT);
    expect(one).toHaveBeenCalledTimes(2);
    expect(two).toHaveBeenCalledTimes(1);
  });
});
