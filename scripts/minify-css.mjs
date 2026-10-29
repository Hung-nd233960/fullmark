// Plain CSS minification: drop comments and the white space around punctuation. The white space before a ":" stays
// (".a :is(x)" and ".a ::before" mean a descendant); the white space after one goes.
export function minifyCss(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ")
    .replace(/\s*([{};,>])\s*/g, "$1")
    .replace(/:\s+/g, ":")
    .replace(/;}/g, "}")
    .trim();
}
