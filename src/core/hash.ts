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

/**
 * The quiz hash: SHA-256 over the normalised file text, then for each referenced asset, sorted by path, a newline,
 * its relative path, a newline and the SHA-256 of its bytes in hex. Assets are hashed as bytes, never normalised.
 */
export function quizHash(text: string, assets: readonly AssetBytes[]): string {
  const sorted = [...assets].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  let body = normaliseText(text);
  for (const asset of sorted) body += `\n${asset.path}\n${sha256Hex(asset.bytes)}`;
  return sha256Hex(body);
}
