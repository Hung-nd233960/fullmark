import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

/**
 * Normalised text for hashing (TECHNICAL_DESIGN.md, foundation 1): no BOM, LF line endings, NFC, trailing
 * whitespace trimmed on every line and trailing blank lines dropped, ending in one newline (or empty).
 */
export function normaliseText(text: string): string {
  const lines = text
    .replace(/^﻿/, "")
    .normalize("NFC")
    .split(/\r\n|\r|\n/)
    .map((line) => line.replace(/[ \t\f\v]+$/, ""));
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines.length === 0 ? "" : `${lines.join("\n")}\n`;
}

export function sha256Hex(data: string | Uint8Array): string {
  return bytesToHex(sha256(typeof data === "string" ? utf8ToBytes(data) : data));
}

/** A referenced file, as the loader reads it: its path relative to the quiz folder (`/` separators) and its bytes. */
export type AssetBytes = { path: string; bytes: Uint8Array };

/** A materials sheet, as the loader reads it: its path relative to the quiz folder and its text. */
export type SheetText = { path: string; text: string };

/**
 * The quiz hash: SHA-256 over the normalised file text, then for each referenced file (asset or sheet), sorted by
 * path, a newline, its relative path, a newline and the SHA-256 of its content in hex. Assets are hashed as bytes,
 * never normalised; a sheet is hashed as its normalised text, like the quiz file.
 */
export function quizHash(text: string, files: readonly (AssetBytes | SheetText)[]): string {
  const sorted = [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  let body = normaliseText(text);
  for (const file of sorted) {
    body += `\n${file.path}\n${sha256Hex("text" in file ? normaliseText(file.text) : file.bytes)}`;
  }
  return sha256Hex(body);
}
