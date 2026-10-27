/**
 * Where each key of a TOML document is, by line. `smol-toml` parses a document to values and says nothing about
 * where they were written, but every config error has to name `file:line`. This index is built by a small scanner
 * over the text of a document that `smol-toml` has already accepted, so it only has to follow valid TOML: tables
 * `[a.b]`, arrays of tables `[[a.b]]`, dotted and quoted keys, inline tables, arrays, strings (also multi-line) and
 * comments. A key of an inline table has the line it is written on. The path of an element of an array of tables
 * or of an array carries its index as a string (`checks`, `0`, `kind`).
 *
 * `lineOf(path)` is the line of the longest prefix of `path` that the document defines, so a path through a
 * default or a missing key still gives the line of the table it should have been in.
 */
export class TomlIndex {
  private readonly lines = new Map<string, number>();
  private readonly starts: number[] = [0];
  private pos = 0;

  constructor(private readonly text: string) {
    for (let i = 0; i < text.length; i++) if (text[i] === "\n") this.starts.push(i + 1);
    try {
      this.document();
    } catch {
      // the text is valid TOML, so this is a gap of the scanner; what was indexed so far still helps
    }
  }

  /** The 1-based line of a path, or of its longest known prefix; 1 when nothing is known. */
  lineOf(path: readonly string[]): number {
    for (let n = path.length; n > 0; n--) {
      const line = this.lines.get(key(path.slice(0, n)));
      if (line !== undefined) return line;
    }
    return 1;
  }

  /** Whether the document defines exactly this path. */
  has(path: readonly string[]): boolean {
    return this.lines.has(key(path));
  }

  private lineAt(offset: number): number {
    let lo = 0;
    let hi = this.starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if ((this.starts[mid] ?? 0) <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  }

  private note(path: string[], offset: number): void {
    for (let n = 1; n <= path.length; n++) {
      const k = key(path.slice(0, n));
      if (!this.lines.has(k)) this.lines.set(k, this.lineAt(offset));
    }
  }

  private get ch(): string {
    return this.text[this.pos] ?? "";
  }

  private blanks(newlines: boolean): void {
    for (;;) {
      const c = this.ch;
      if (c === " " || c === "\t" || c === "\r") this.pos++;
      else if (newlines && c === "\n") this.pos++;
      else if (c === "#") {
        while (this.pos < this.text.length && this.ch !== "\n") this.pos++;
      } else return;
    }
  }

  private document(): void {
    let table: string[] = [];
    const arrays = new Map<string, number>();
    while (this.pos < this.text.length) {
      this.blanks(true);
      if (this.pos >= this.text.length) break;
      const at = this.pos;
      if (this.text.startsWith("[[", this.pos)) {
        this.pos += 2;
        const path = this.keyPath();
        this.expect("]]");
        const k = key(path);
        const index = arrays.get(k) ?? 0;
        arrays.set(k, index + 1);
        table = [...path, String(index)];
        this.note(path, at);
        this.note(table, at);
      } else if (this.ch === "[") {
        this.pos++;
        const path = this.keyPath();
        this.expect("]");
        table = path;
        this.note(table, at);
      } else {
        const path = this.keyPath();
        this.expect("=");
        const full = [...table, ...path];
        this.note(full, at);
        this.blanks(false);
        this.value(full);
      }
    }
  }

  private expect(token: string): void {
    this.blanks(false);
    if (!this.text.startsWith(token, this.pos)) throw new Error(`expected ${token}`);
    this.pos += token.length;
  }

  /** A dotted key: bare, "basic" or 'literal' parts. */
  private keyPath(): string[] {
    const parts: string[] = [];
    for (;;) {
      this.blanks(false);
      const c = this.ch;
      if (c === '"') parts.push(this.basicString());
      else if (c === "'") parts.push(this.literalString());
      else {
        const start = this.pos;
        while (/[A-Za-z0-9_-]/.test(this.ch)) this.pos++;
        if (this.pos === start) throw new Error("expected a key");
        parts.push(this.text.slice(start, this.pos));
      }
      this.blanks(false);
      if (this.ch === ".") this.pos++;
      else return parts;
    }
  }

  private basicString(): string {
    this.pos++;
    let out = "";
    while (this.pos < this.text.length && this.ch !== '"') {
      if (this.ch === "\\") {
        out += this.text[this.pos + 1] ?? "";
        this.pos += 2;
      } else out += this.text[this.pos++];
    }
    this.pos++;
    return out;
  }

  private literalString(): string {
    const end = this.text.indexOf("'", this.pos + 1);
    const out = this.text.slice(this.pos + 1, end);
    this.pos = end + 1;
    return out;
  }

  private value(path: string[]): void {
    const c = this.ch;
    if (this.text.startsWith('"""', this.pos) || this.text.startsWith("'''", this.pos)) {
      const quote = this.text.slice(this.pos, this.pos + 3);
      let at = this.pos + 3;
      for (;;) {
        const end = this.text.indexOf(quote, at);
        if (end < 0) throw new Error("unclosed string");
        if (quote === '"""' && this.text[end - 1] === "\\") at = end + 1;
        else {
          this.pos = end + 3;
          while (this.ch === quote[0]) this.pos++; // up to two more quotes may end the string
          return;
        }
      }
    } else if (c === '"') this.basicString();
    else if (c === "'") this.literalString();
    else if (c === "[") {
      this.pos++;
      let index = 0;
      for (;;) {
        this.blanks(true);
        if (this.ch === "]") {
          this.pos++;
          return;
        }
        const element = [...path, String(index++)];
        this.note(element, this.pos);
        this.value(element);
        this.blanks(true);
        if (this.ch === ",") this.pos++;
      }
    } else if (c === "{") {
      this.pos++;
      for (;;) {
        this.blanks(true);
        if (this.ch === "}") {
          this.pos++;
          return;
        }
        const at = this.pos;
        const inner = [...path, ...this.keyPath()];
        this.expect("=");
        this.note(inner, at);
        this.blanks(false);
        this.value(inner);
        this.blanks(true);
        if (this.ch === ",") this.pos++;
      }
    } else {
      while (this.pos < this.text.length && !/[,\]}\n#]/.test(this.ch)) this.pos++;
    }
  }
}

const key = (path: readonly string[]): string => path.join("\u0000");
