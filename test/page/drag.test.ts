import { describe, expect, it } from "vitest";
import { DRAG_SLOP, edgeScroll, grabOf, landingIndex, liveNumbers, moveItem, pulled } from "../../src/page/questions/drag";

const rows = (heights: number[], gap = 6) => {
  let top = 100;
  return heights.map((height) => {
    const r = { top, height };
    top += height + gap;
    return r;
  });
};

describe("landingIndex", () => {
  const rects = rows([44, 44, 60, 44]); // middles 122, 172, 230, 296
  it("is the number of staying items whose middle is above the lifted middle", () => {
    expect(landingIndex(rects, 50)).toBe(0);
    expect(landingIndex(rects, 130)).toBe(1);
    expect(landingIndex(rects, 200)).toBe(2);
    expect(landingIndex(rects, 250)).toBe(3);
    expect(landingIndex(rects, 900)).toBe(4);
  });
  it("is 0 for an empty list", () => {
    expect(landingIndex([], 10)).toBe(0);
  });
});

describe("moveItem", () => {
  it("takes the item out and puts it back among the others", () => {
    expect(moveItem([5, 6, 7, 8], 0, 3)).toEqual([6, 7, 8, 5]);
    expect(moveItem([5, 6, 7, 8], 3, 0)).toEqual([8, 5, 6, 7]);
    expect(moveItem([5, 6, 7, 8], 1, 1)).toEqual([5, 6, 7, 8]);
  });
  it("gives the same order as the equivalent presses of the buttons", () => {
    const swap = (o: number[], i: number, j: number) => {
      const n = [...o];
      [n[i], n[j]] = [n[j] as number, n[i] as number];
      return n;
    };
    // item 0 moved down twice
    expect(moveItem([5, 6, 7, 8], 0, 2)).toEqual(swap(swap([5, 6, 7, 8], 0, 1), 1, 2));
  });
});

describe("edgeScroll", () => {
  it("scrolls up near the top, down near the bottom, and not elsewhere", () => {
    expect(edgeScroll(300, 800)).toBe(0);
    expect(edgeScroll(10, 800)).toBeLessThan(0);
    expect(edgeScroll(790, 800)).toBeGreaterThan(0);
    expect(edgeScroll(-20, 800)).toBe(-18);
  });
});

describe("liveNumbers", () => {
  it("is 1..n without a lift", () => {
    expect(liveNumbers(4, null, null)).toEqual([1, 2, 3, 4]);
  });
  it("counts the staying rows around the slot and gives the lifted one the slot's number", () => {
    // item at 0 lifted over slot 2: rows 1,2 move up, the lifted one will be third
    expect(liveNumbers(4, 0, 2)).toEqual([3, 1, 2, 4]);
    // item at 3 lifted to the front
    expect(liveNumbers(4, 3, 0)).toEqual([2, 3, 4, 1]);
    // lifted but not moved
    expect(liveNumbers(4, 1, 1)).toEqual([1, 2, 3, 4]);
  });
  it("matches the order moveItem gives", () => {
    const order = [10, 11, 12, 13, 14];
    for (let from = 0; from < 5; from++) {
      for (let to = 0; to < 5; to++) {
        const landed = moveItem(order, from, to);
        const numbers = liveNumbers(5, from, to);
        order.forEach((item, i) => expect(numbers[i]).toBe(landed.indexOf(item) + 1));
      }
    }
  });
});

describe("who drags a row", () => {
  it("lets a mouse or pen drag by any part of the row, after it has moved", () => {
    for (const type of ["mouse", "pen"]) {
      expect(grabOf(type, false, false)).toBe("after-move");
      expect(grabOf(type, true, false)).toBe("after-move");
    }
  });

  it("lets touch drag by the handle only, at once", () => {
    expect(grabOf("touch", true, false)).toBe("now");
    expect(grabOf("touch", false, false)).toBe("never");
  });

  it("never drags from the Up or Down button", () => {
    for (const type of ["mouse", "pen", "touch"]) {
      expect(grabOf(type, false, true)).toBe("never");
      expect(grabOf(type, true, true)).toBe("never");
    }
  });

  it("lifts at 4 px of movement, not before", () => {
    expect(DRAG_SLOP).toBe(4);
    expect(pulled(10, 10, 10, 13)).toBe(false);
    expect(pulled(10, 10, 13, 13)).toBe(true); // 4.24 px along the diagonal
    expect(pulled(10, 10, 10, 14)).toBe(true);
    expect(pulled(10, 10, 6, 10)).toBe(true);
    expect(pulled(10, 10, 10, 10)).toBe(false);
  });
});
