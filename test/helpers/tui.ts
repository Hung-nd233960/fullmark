import { PassThrough, Writable } from "node:stream";

/** The keys a person presses. */
export const KEY = {
  enter: "\r",
  up: "\x1b[A",
  down: "\x1b[B",
  space: " ",
  ctrlC: "\x03",
  clear: "\x15",
};

/** A text answer typed over whatever the box already holds. */
export const typed = (text: string): string => `${KEY.clear}${text}${KEY.enter}`;
/** A select moved `n` rows down (or up, when negative) and chosen. */
export const pick = (n: number): string => (n < 0 ? KEY.up.repeat(-n) : KEY.down.repeat(n)) + KEY.enter;

export type FakeTerminal = {
  input: PassThrough & { isTTY: boolean; setRawMode(on: boolean): void };
  output: Writable & { isTTY: boolean; columns: number; rows: number };
  /** what was drawn, as text */
  drawn(): string;
  /** how many prompts asked something */
  prompts(): number;
  /** resolves when every step of the script was fed */
  fed: Promise<void>;
};

/**
 * Streams that report themselves as a terminal, for driving `--tui` in process. `script` is one string of keys per
 * prompt, fed when that prompt starts listening (a prompt announces itself by listening for key presses), so keys never
 * reach a prompt that is not there yet.
 */
export function fakeTerminal(script: readonly string[]): FakeTerminal {
  const input = new PassThrough() as FakeTerminal["input"];
  input.isTTY = true;
  input.setRawMode = () => undefined;
  const chunks: string[] = [];
  const output = new Writable({
    write(chunk, _enc, done) {
      chunks.push(String(chunk));
      done();
    },
  }) as FakeTerminal["output"];
  output.isTTY = true;
  output.columns = 100;
  output.rows = 50;

  let next = 0;
  let scheduled = false;
  let started = 0;
  let finish: () => void = () => undefined;
  const fed = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const feed = (): void => {
    scheduled = false;
    started++;
    const keys = script[next++];
    if (keys === undefined) return;
    input.write(keys);
    if (next >= script.length) finish();
  };
  const on = input.on.bind(input) as (event: string, listener: (...args: never[]) => void) => unknown;
  (input as { on: unknown }).on = (event: string, listener: (...args: never[]) => void) => {
    const result = on(event, listener);
    if (event === "keypress" && !scheduled) {
      scheduled = true;
      setImmediate(feed);
    }
    return result;
  };
  return { input, output, drawn: () => chunks.join(""), prompts: () => started, fed };
}
