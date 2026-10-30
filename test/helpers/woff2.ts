import { brotliDecompressSync } from "node:zlib";

/** A minimal WOFF2 reader for the tests: the untransformed tables (`cmap`, `OS/2`, `hhea`, `head`) and the cmap's code points. */

const KNOWN = [
  "cmap", "head", "hhea", "hmtx", "maxp", "name", "OS/2", "post", "cvt ", "fpgm", "glyf", "loca", "prep", "CFF ",
  "VORG", "EBDT", "EBLC", "gasp", "hdmx", "kern", "LTSH", "PCLT", "VDMX", "vhea", "vmtx", "BASE", "GDEF", "GPOS",
  "GSUB", "EBSC", "JSTF", "MATH", "CBDT", "CBLC", "COLR", "CPAL", "SVG ", "sbix", "acnt", "avar", "bdat", "bloc",
  "bsln", "cvar", "fdsc", "feat", "fmtx", "fvar", "gvar", "hsty", "just", "lcar", "mort", "morx", "opbd", "prop",
  "trak", "Zapf", "Silf", "Glat", "Gloc", "Feat", "Sill",
]; // biome-ignore format: the table-tag list of the WOFF2 spec

/** The tables of a WOFF2 file by tag (transformed ones are skipped: the tests never need `glyf`, `loca` or `hmtx`). */
export function woff2Tables(file: Uint8Array): Map<string, Uint8Array> {
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
  if (view.getUint32(0) !== 0x774f4632) throw new Error("not a WOFF2 file");
  const count = view.getUint16(12);
  const compressed = view.getUint32(20);
  let at = 48;
  const base128 = (): number => {
    let value = 0;
    for (let i = 0; i < 5; i++) {
      const byte = file[at++] as number;
      value = value * 128 + (byte & 0x7f);
      if ((byte & 0x80) === 0) return value;
    }
    throw new Error("bad UIntBase128");
  };
  const entries: { tag: string; length: number; transformed: boolean }[] = [];
  for (let i = 0; i < count; i++) {
    const flags = file[at++] as number;
    const index = flags & 0x3f;
    const version = flags >> 6;
    let tag: string;
    if (index === 63) {
      tag = String.fromCharCode(...file.subarray(at, at + 4));
      at += 4;
    } else tag = KNOWN[index] as string;
    const original = base128();
    const transformed =
      tag === "glyf" || tag === "loca" ? version !== 3 : tag === "hmtx" ? version === 1 : version !== 0;
    entries.push({ tag, length: transformed ? base128() : original, transformed });
  }
  const data = brotliDecompressSync(file.subarray(at, at + compressed));
  const tables = new Map<string, Uint8Array>();
  let offset = 0;
  for (const e of entries) {
    if (!e.transformed) tables.set(e.tag, data.subarray(offset, offset + e.length));
    offset += e.length;
  }
  return tables;
}

/** Every code point of the font's best Unicode `cmap` subtable (format 12 if there is one, else format 4). */
export function woff2CodePoints(file: Uint8Array): Set<number> {
  const cmap = woff2Tables(file).get("cmap");
  if (cmap === undefined) throw new Error("no cmap table");
  const v = new DataView(cmap.buffer, cmap.byteOffset, cmap.byteLength);
  const subtables: { platform: number; encoding: number; offset: number }[] = [];
  for (let i = 0; i < v.getUint16(2); i++) {
    subtables.push({
      platform: v.getUint16(4 + i * 8),
      encoding: v.getUint16(6 + i * 8),
      offset: v.getUint32(8 + i * 8),
    });
  }
  const unicode = subtables.filter(
    (s) => s.platform === 0 || (s.platform === 3 && (s.encoding === 1 || s.encoding === 10)),
  );
  const formatOf = (s: { offset: number }) => v.getUint16(s.offset);
  const chosen = unicode.find((s) => formatOf(s) === 12) ?? unicode.find((s) => formatOf(s) === 4);
  if (chosen === undefined) throw new Error("no Unicode cmap subtable of format 4 or 12");
  const out = new Set<number>();
  const o = chosen.offset;
  if (formatOf(chosen) === 12) {
    for (let g = 0; g < v.getUint32(o + 12); g++) {
      const start = v.getUint32(o + 16 + g * 12);
      const end = v.getUint32(o + 20 + g * 12);
      const first = v.getUint32(o + 24 + g * 12);
      for (let c = start; c <= end; c++) if (first + (c - start) !== 0) out.add(c);
    }
    return out;
  }
  const segs = v.getUint16(o + 6) / 2;
  const endAt = o + 14;
  const startAt = endAt + segs * 2 + 2;
  const deltaAt = startAt + segs * 2;
  const rangeAt = deltaAt + segs * 2;
  for (let s = 0; s < segs; s++) {
    const end = v.getUint16(endAt + s * 2);
    const start = v.getUint16(startAt + s * 2);
    const delta = v.getInt16(deltaAt + s * 2);
    const range = v.getUint16(rangeAt + s * 2);
    for (let c = start; c <= end && c !== 0xffff; c++) {
      let glyph: number;
      if (range === 0) glyph = (c + delta) & 0xffff;
      else {
        const at = rangeAt + s * 2 + range + (c - start) * 2;
        const raw = v.getUint16(at);
        glyph = raw === 0 ? 0 : (raw + delta) & 0xffff;
      }
      if (glyph !== 0) out.add(c);
    }
  }
  return out;
}

/** The metrics a size adjustment needs, in font units: `unitsPerEm` (head), ascender, descender (hhea), x-height, cap height (OS/2 v2+). */
export function woff2Metrics(file: Uint8Array): {
  unitsPerEm: number;
  ascender: number;
  descender: number;
  lineGap: number;
  xHeight: number;
  capHeight: number;
} {
  const tables = woff2Tables(file);
  const head = tables.get("head") as Uint8Array;
  const hhea = tables.get("hhea") as Uint8Array;
  const os2 = tables.get("OS/2") as Uint8Array;
  const h = new DataView(head.buffer, head.byteOffset, head.byteLength);
  const a = new DataView(hhea.buffer, hhea.byteOffset, hhea.byteLength);
  const o = new DataView(os2.buffer, os2.byteOffset, os2.byteLength);
  return {
    unitsPerEm: h.getUint16(18),
    ascender: a.getInt16(4),
    descender: a.getInt16(6),
    lineGap: a.getInt16(8),
    xHeight: o.getInt16(86),
    capHeight: o.getInt16(88),
  };
}
