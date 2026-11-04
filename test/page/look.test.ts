import { h } from "preact";
import { renderToString } from "preact-render-to-string";
import { describe, expect, it } from "vitest";
import { pageQuizOf } from "../../src/build/page";
import { en } from "../../src/core/i18n/en";
import { vi } from "../../src/core/i18n/vi";
import type { Choice } from "../../src/core/themes";
import { App } from "../../src/page/App";
import { keyHandler } from "../../src/page/keys";
import { SIZES, sizeFactor } from "../../src/page/look";
import { messagesFor } from "../../src/page/questions/shared";
import { lookKey } from "../../src/page/saved";
import { createStore } from "../../src/page/store";
import { build } from "../helpers/page";

const QUIZ = [
  "---",
  "title: T",
  "id: look",
  "---",
  "",
  "# Part {id=a}",
  "",
  "## Q q1? {type=single id=q1 points=2}",
  "",
  "- [x] right",
  "- [ ] wrong",
  "",
].join("\n");

class Memory {
  items = new Map<string, string>();
  get length() {
    return this.items.size;
  }
  key = (i: number) => [...this.items.keys()][i] ?? null;
  getItem = (k: string) => this.items.get(k) ?? null;
  setItem = (k: string, v: string) => void this.items.set(k, v);
  removeItem = (k: string) => void this.items.delete(k);
}

function open(memory: Memory | null, theme: Choice = "paper", look: "free" | "locked" = "free") {
  const page = pageQuizOf(build(QUIZ));
  const store = createStore(
    { version: 1, quizzes: [page], theme, look },
    memory === null ? {} : { storage: () => memory as unknown as Storage },
  );
  return { store, key: lookKey(page) };
}

describe("the look", () => {
  it("opens in the quiz's theme", () => {
    const { store } = open(new Memory(), "oled");
    store.restore();
    expect(store.look.shown.value).toBe("oled");
    expect(store.look.chosen.value).toBeNull();
  });

  it("follows the device for auto, live", () => {
    const { store } = open(new Memory(), "auto");
    expect(store.look.shown.value).toBe("light");
    store.look.device.value = { dark: true, more: false };
    expect(store.look.shown.value).toBe("dark");
    store.look.device.value = { dark: false, more: false };
    expect(store.look.shown.value).toBe("light");
  });

  it("shows white for paper and oled for dark under high contrast", () => {
    const paper = open(new Memory(), "paper").store;
    paper.look.device.value = { dark: false, more: true };
    expect(paper.look.shown.value).toBe("white");
    const dark = open(new Memory(), "dark", "locked").store;
    dark.look.device.value = { dark: false, more: true };
    expect(dark.look.shown.value).toBe("oled");
  });

  it("stores a pick under the look key and reads it back on the next visit", () => {
    const memory = new Memory();
    const first = open(memory);
    first.store.look.pick("dark");
    expect(JSON.parse(memory.items.get(first.key) as string)).toEqual({
      theme: "dark",
    });
    const next = open(memory);
    next.store.restore();
    expect(next.store.look.shown.value).toBe("dark");
    expect(memory.items.has(first.key)).toBe(true); // restore keeps the key
  });

  it("keeps the other fields of the stored object, and Reset removes the key when nothing else is left", () => {
    const memory = new Memory();
    const a = open(memory);
    memory.items.set(a.key, JSON.stringify({ theme: "white", font: "serif" }));
    a.store.restore();
    a.store.look.pick("oled");
    expect(JSON.parse(memory.items.get(a.key) as string)).toEqual({
      theme: "oled",
      font: "serif",
    });
    a.store.look.pick(null);
    expect(JSON.parse(memory.items.get(a.key) as string)).toEqual({
      font: "serif",
    });
    expect(a.store.look.shown.value).toBe("paper");
    memory.items.set(a.key, JSON.stringify({ theme: "oled" }));
    a.store.look.pick(null);
    expect(memory.items.has(a.key)).toBe(false);
  });

  it("ignores a stored look that is not a theme", () => {
    const memory = new Memory();
    const a = open(memory);
    memory.items.set(a.key, '{"theme":"neon"}');
    a.store.restore();
    expect(a.store.look.shown.value).toBe("paper");
  });

  it("opens with the quiz's look when storage fails, and keeps the pick for the visit", () => {
    const { store } = open(null);
    store.restore();
    store.look.pick("dark");
    expect(store.look.shown.value).toBe("dark");
    const broken = {
      get length(): number {
        throw new Error("blocked");
      },
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
      key: () => null,
    };
    const page = pageQuizOf(build(QUIZ));
    const failing = createStore(
      { version: 1, quizzes: [page], theme: "paper" },
      { storage: () => broken as unknown as Storage },
    );
    failing.restore();
    expect(failing.look.shown.value).toBe("paper");
  });

  it("locked: ignores a stored look without deleting it, and a pick does nothing", () => {
    const memory = new Memory();
    const a = open(memory, "paper", "locked");
    memory.items.set(a.key, '{"theme":"dark"}');
    a.store.restore();
    expect(a.store.look.shown.value).toBe("paper");
    a.store.look.pick("oled");
    expect(a.store.look.shown.value).toBe("paper");
    expect(memory.items.get(a.key)).toBe('{"theme":"dark"}');
  });
});

describe("the Appearance menu", () => {
  const page = (store: ReturnType<typeof open>["store"]) => {
    const id = [...store.quizzes.keys()][0] as string;
    store.start(id);
    return renderToString(h(App, { store }));
  };
  const esc = (store: ReturnType<typeof open>["store"]) =>
    keyHandler(store)({
      key: "Escape",
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      target: { tagName: "BODY" },
      preventDefault: () => undefined,
    });

  it("has a button in the top bar under look: free, and none under locked", () => {
    expect(page(open(new Memory()).store)).toContain('data-action="appearance"');
    expect(page(open(new Memory(), "paper", "locked").store)).not.toContain('data-action="appearance"');
  });

  it("is closed at first; open, it lists Auto, Light, Dark, OLED, White, Paper with the quiz's marked and named", () => {
    const { store } = open(new Memory(), "paper");
    expect(page(store)).not.toContain("data-look-menu");
    store.look.menu.value = true;
    const html = page(store);
    for (const name of ["Auto", "Light", "Dark", "OLED", "White"]) expect(html).toContain(`>${name}</button>`);
    expect(html).toContain("Paper ·");
    expect(html).toContain('aria-label="Paper, the quiz\'s look"');
    expect(html).toContain('data-theme-pick="paper" aria-pressed="true"');
    expect(html).not.toContain("Default look");
  });

  it("offers Reset only when the choice differs from the quiz's, and picking the quiz's own theme drops the choice", () => {
    const { store } = open(new Memory(), "paper");
    store.look.menu.value = true;
    store.look.pick("dark");
    expect(page(store)).toContain("Default look");
    store.look.pick("paper");
    expect(store.look.chosen.value).toBeNull();
    expect(page(store)).not.toContain("Default look");
  });

  it("closes on Esc", () => {
    const { store } = open(new Memory());
    store.look.menu.value = true;
    esc(store);
    expect(store.look.menu.value).toBe(false);
  });
});

describe("the text size", () => {
  it("shows the size as a percentage of the default, rounded", () => {
    expect(SIZES.map(sizeFactor)).toEqual([0.88, 1, 1.12, 1.24, 1.35]);
    expect(vi.page.textSizeValue(1.12)).toBe("1,12×");
    expect(en.page.textSizeValue(1)).toBe("1×");
  });

  it("the middle button is inert at 1×, and resets (stored) at any other size", () => {
    const memory = new Memory();
    const a = open(memory);
    a.store.restore();
    const html = () => {
      a.store.start([...a.store.quizzes.keys()][0] as string);
      return renderToString(h(App, { store: a.store }));
    };
    let h1 = html();
    expect(h1).toMatch(
      /data-action="reset-size" aria-label="Text size 1×" aria-disabled="true" title="Text size 1×">1×</,
    );
    a.store.look.step(1);
    h1 = html();
    expect(h1).toMatch(/aria-label="Text size 1.12×, reset to 1×" aria-disabled="false" title="Back to 1×">1.12×</);
    a.store.look.resetSize();
    expect(a.store.look.size.value).toBe(17);
    expect(memory.items.get(a.key) ?? "").not.toContain("size");
  });

  it("says it in Vietnamese", () => {
    const m = messagesFor({ lang: "vi", uiLang: "vi" } as never);
    expect(m.textSizeResets(m.textSizeValue(1.12))).toBe("Cỡ chữ 1,12×, về 1×");
    expect(m.textSizeNow(m.textSizeValue(1))).toBe("Cỡ chữ 1×");
  });

  const throwing = () => {
    throw new Error("blocked");
  };

  it("steps through 15, 17, 19, 21, 23 and stays at the ends", () => {
    const { store } = open(new Memory());
    store.restore();
    const seen: number[] = [store.look.size.value];
    for (let i = 0; i < 5; i++) {
      store.look.step(1);
      seen.push(store.look.size.value);
    }
    expect(seen).toEqual([17, 19, 21, 23, 23, 23]);
    for (let i = 0; i < 6; i++) store.look.step(-1);
    expect(store.look.size.value).toBe(15);
  });

  it("is stored in the look object beside the theme, and the default is not stored", () => {
    const memory = new Memory();
    const a = open(memory);
    a.store.restore();
    a.store.look.pick("dark");
    a.store.look.step(1);
    expect(JSON.parse(memory.items.get(a.key) as string)).toEqual({
      theme: "dark",
      size: 19,
    });
    a.store.look.step(-1);
    expect(JSON.parse(memory.items.get(a.key) as string)).toEqual({
      theme: "dark",
    });
  });

  it("comes back after a reload, under free", () => {
    const memory = new Memory();
    const a = open(memory);
    a.store.restore();
    a.store.look.step(1);
    a.store.look.step(1);
    const b = open(memory);
    b.store.restore();
    expect(b.store.look.size.value).toBe(21);
  });

  it("is applied under locked while the stored theme stays ignored and kept", () => {
    const memory = new Memory();
    const a = open(memory, "paper", "locked");
    memory.items.set(a.key, '{"theme":"dark","size":23}');
    a.store.restore();
    expect(a.store.look.shown.value).toBe("paper");
    expect(a.store.look.size.value).toBe(23);
    a.store.look.step(-1);
    expect(JSON.parse(memory.items.get(a.key) as string)).toEqual({
      theme: "dark",
      size: 21,
    });
  });

  it("ignores a stored size that is not one of the five", () => {
    const memory = new Memory();
    const a = open(memory);
    memory.items.set(a.key, '{"size":18}');
    a.store.restore();
    expect(a.store.look.size.value).toBe(17);
  });

  it("Default look resets the theme and the size", () => {
    const memory = new Memory();
    const a = open(memory, "paper");
    a.store.restore();
    a.store.look.pick("dark");
    a.store.look.step(1);
    a.store.look.reset();
    expect(a.store.look.chosen.value).toBeNull();
    expect(a.store.look.size.value).toBe(17);
    expect(memory.items.has(a.key)).toBe(false);
  });

  it("works for the visit when storage throws", () => {
    const broken = {
      get length(): number {
        return throwing();
      },
      getItem: throwing,
      setItem: throwing,
      removeItem: throwing,
      key: throwing,
    };
    const page = pageQuizOf(build(QUIZ));
    const store = createStore(
      { version: 1, quizzes: [page], look: "locked" },
      { storage: () => broken as unknown as Storage },
    );
    store.restore();
    store.look.step(1);
    expect(store.look.size.value).toBe(19);
  });

  it("draws the pair in the bar (disabled at the ends) and, on a phone, the Text size row; locked keeps both", () => {
    const render = (store: ReturnType<typeof open>["store"]) => {
      store.start([...store.quizzes.keys()][0] as string);
      return renderToString(h(App, { store }));
    };
    const { store } = open(new Memory());
    let html = render(store);
    expect(html).toContain(">Smaller text<");
    expect(html).toContain(">Larger text<");
    expect(html).not.toContain('class="fm-look-label">Text size<');
    for (let i = 0; i < 4; i++) store.look.step(-1);
    html = render(store);
    expect(html).toMatch(/data-action="smaller"[^>]*disabled/);
    store.screen.phone.value = true;
    store.look.menu.value = true;
    html = render(store);
    expect(html).toContain('class="fm-look-label">Text size<');
    expect(html).not.toMatch(/data-textsize[\s\S]*data-textsize[\s\S]*Appearance/);
    const locked = open(new Memory(), "paper", "locked").store;
    expect(render(locked)).toContain(">Larger text<");
    expect(render(locked)).not.toContain('data-action="appearance"');
    locked.screen.phone.value = true;
    locked.look.menu.value = true;
    const lockedPhone = render(locked);
    expect(lockedPhone).toContain('data-action="appearance"');
    expect(lockedPhone).toContain('class="fm-look-label">Text size<');
    expect(lockedPhone).not.toContain("data-theme-pick");
  });
});

describe("the font", () => {
  const ALL = ["system", "sans", "serif", "readable"] as const;
  const openFont = (
    memory: Memory | null,
    options: {
      look?: "free" | "locked";
      font?: "system" | "sans" | "serif" | "readable";
      fonts?: readonly string[];
    } = {},
  ) => {
    const page = pageQuizOf(build(QUIZ));
    const store = createStore(
      {
        version: 1,
        quizzes: [page],
        theme: "paper",
        look: options.look ?? "free",
        font: options.font ?? "system",
        fonts: [...(options.fonts ?? ALL)] as ("system" | "sans" | "serif" | "readable")[],
      },
      memory === null ? {} : { storage: () => memory as unknown as Storage },
    );
    return { store, key: lookKey(page) };
  };

  it("names the fonts by category in the Font row, with the family as each pill's tooltip", () => {
    const { store } = openFont(new Memory());
    store.look.menu.value = true;
    const id = [...store.quizzes.keys()][0] as string;
    store.start(id);
    const html = renderToString(h(App, { store }));
    expect(html).toContain('data-font-pick="sans" title="Be Vietnam Pro"');
    expect(html).toContain('data-font-pick="serif" title="Source Serif 4"');
    expect(html).toContain('data-font-pick="readable" title="Lexend"');
    expect(html).not.toMatch(/data-font-pick="system" title=/);
    for (const name of ["System", "Sans", "Serif", "Readable"]) expect(html).toContain(`>${name}</button>`);
    expect(vi.page.fontName).toEqual({ system: "Hệ thống", sans: "Sans", serif: "Serif", readable: "Dễ đọc" });
  });

  it("stores a pick in the look object beside the theme and the size, and reads it back", () => {
    const memory = new Memory();
    const a = openFont(memory);
    a.store.restore();
    a.store.look.pick("dark");
    a.store.look.pickFont("serif");
    a.store.look.step(1);
    expect(JSON.parse(memory.items.get(a.key) as string)).toEqual({ theme: "dark", font: "serif", size: 19 });
    const b = openFont(memory);
    b.store.restore();
    expect(b.store.look.font.value).toBe("serif");
  });

  it("opens in the quiz's font, and picking the quiz's own font drops the choice", () => {
    const memory = new Memory();
    const a = openFont(memory, { font: "sans" });
    a.store.restore();
    expect(a.store.look.font.value).toBe("sans");
    a.store.look.pickFont("readable");
    expect(a.store.look.font.value).toBe("readable");
    a.store.look.pickFont("sans");
    expect(a.store.look.chosenFont.value).toBeNull();
    expect(memory.items.has(a.key)).toBe(false);
  });

  it("locked: ignores a stored font without deleting it, and a pick does nothing", () => {
    const memory = new Memory();
    const a = openFont(memory, { look: "locked", font: "sans" });
    memory.items.set(a.key, '{"font":"serif"}');
    a.store.restore();
    expect(a.store.look.font.value).toBe("sans");
    a.store.look.pickFont("readable");
    expect(a.store.look.font.value).toBe("sans");
    expect(memory.items.get(a.key)).toBe('{"font":"serif"}');
  });

  it("falls back to the quiz's font for a stored font the page no longer offers, and keeps it stored", () => {
    const memory = new Memory();
    const a = openFont(memory, { font: "sans", fonts: ["system", "sans"] });
    memory.items.set(a.key, '{"font":"serif"}');
    a.store.restore();
    expect(a.store.look.font.value).toBe("sans");
    expect(memory.items.get(a.key)).toBe('{"font":"serif"}');
    memory.items.set(a.key, '{"font":"comic"}');
    const b = openFont(memory);
    b.store.restore();
    expect(b.store.look.font.value).toBe("system");
  });

  it("Default look resets the font with the theme and the size", () => {
    const memory = new Memory();
    const a = openFont(memory);
    a.store.restore();
    a.store.look.pickFont("serif");
    a.store.look.pick("dark");
    a.store.look.reset();
    expect(a.store.look.font.value).toBe("system");
    expect(memory.items.has(a.key)).toBe(false);
  });

  it("works for the visit when storage throws", () => {
    const throwing = () => {
      throw new Error("blocked");
    };
    const broken = {
      get length(): number {
        return throwing();
      },
      getItem: throwing,
      setItem: throwing,
      removeItem: throwing,
      key: throwing,
    };
    const a = openFont(broken as unknown as Memory);
    a.store.restore();
    a.store.look.pickFont("readable");
    expect(a.store.look.font.value).toBe("readable");
  });

  it("draws a pill per offered font, none with one font, and none under locked", () => {
    const render = (store: ReturnType<typeof openFont>["store"]) => {
      store.look.menu.value = true;
      store.start([...store.quizzes.keys()][0] as string);
      return renderToString(h(App, { store }));
    };
    const html = render(openFont(new Memory()).store);
    for (const id of ALL) expect(html).toContain(`data-font-pick="${id}"`);
    expect(html).toContain("fm-font-serif");
    expect(html).toContain(">Font<");
    expect(render(openFont(new Memory(), { fonts: ["system"] }).store)).not.toContain("data-font-pick");
    expect(render(openFont(new Memory(), { look: "locked" }).store)).not.toContain("data-font-pick");
  });
});
