import { sha256 } from "@noble/hashes/sha2.js";
import { utf8ToBytes } from "@noble/hashes/utils.js";
import { canonicalJson } from "./canonical";

/**
 * The answer key as a page carries it (TECHNICAL_DESIGN.md, foundation 5: obfuscated, not secret): canonical JSON,
 * UTF-8, XOR with the bytes of SHA-256 of the quiz hash repeated, then base64. Deterministic, so two builds agree.
 * It keeps a learner from seeing answers by accident; whoever reads the page source can decode it.
 */
function mask(bytes: Uint8Array, quizHash: string): Uint8Array {
  const pad = sha256(utf8ToBytes(quizHash));
  const out = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) out[i] = (bytes[i] as number) ^ (pad[i % pad.length] as number);
  return out;
}

export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array {
  const binary = atob(text);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export function encodeKey(value: unknown, quizHash: string): string {
  return toBase64(mask(utf8ToBytes(canonicalJson(value)), quizHash));
}

export function decodeKey(blob: string, quizHash: string): unknown {
  return JSON.parse(new TextDecoder().decode(mask(fromBase64(blob), quizHash)));
}
