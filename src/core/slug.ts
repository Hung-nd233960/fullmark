/**
 * The slug function of TECHNICAL_DESIGN.md section 9: lower-case ASCII letters and digits joined by single hyphens.
 * `đ` and `Đ` have no Unicode decomposition, so they are mapped to `d` before the accents are stripped.
 */
export function slug(text: string): string {
  return text
    .replaceAll("đ", "d")
    .replaceAll("Đ", "d")
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** The id format of QUIZ_SYNTAX.md ("Ids"): lower-case letters, digits and `-`, starting with a letter, at most 64. */
export const ID_FORMAT = /^[a-z][a-z0-9-]{0,63}$/;
