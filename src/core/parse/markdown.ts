import MarkdownIt, { type MarkdownIt as Md, type StateBlock, type StateInline } from "markdown-it";
import container from "markdown-it-container";
import { matchMath } from "./spans";

/**
 * The markdown-it instance used for block structure, line maps and finding raw HTML and images. Nothing is
 * rendered here. HTML is on so that tags become tokens we can report; maths is recognised so that `<` and `*`
 * inside it are not read as HTML or emphasis; `:::` containers are opened for any name, and the parser decides
 * which names are known.
 */
function mathInline(state: StateInline, silent: boolean): boolean {
  if (state.src[state.pos] !== "$") return false;
  const end = matchMath(state.src, state.pos);
  if (end < 0) return false;
  if (!silent) {
    const token = state.push("math_inline", "", 0);
    token.content = state.src.slice(state.pos, end);
  }
  state.pos = end;
  return true;
}

function mathBlock(state: StateBlock, startLine: number, endLine: number, silent: boolean): boolean {
  if (state.sCount[startLine]! - state.blkIndent >= 4) return false;
  const start = state.bMarks[startLine]! + state.tShift[startLine]!;
  if (state.src.slice(start, start + 2) !== "$$") return false;
  const firstText = state.src.slice(start, state.eMarks[startLine]).trimEnd();
  let last = startLine;
  if (!(firstText.length > 3 && firstText.endsWith("$$"))) {
    let found = false;
    for (let i = startLine + 1; i < endLine; i++) {
      const text = state.src.slice(state.bMarks[i]! + state.tShift[i]!, state.eMarks[i]).trimEnd();
      if (text.endsWith("$$")) {
        last = i;
        found = true;
        break;
      }
    }
    if (!found) return false;
  }
  if (silent) return true;
  const token = state.push("math_block", "", 0);
  token.map = [startLine, last + 1];
  token.content = state.getLines(startLine, last + 1, state.sCount[startLine]!, false);
  token.block = true;
  state.line = last + 1;
  return true;
}

export function createMarkdown(): Md {
  const md = new MarkdownIt({ html: true, linkify: false, typographer: false });
  md.inline.ruler.before("escape", "math_inline", mathInline);
  md.block.ruler.before("fence", "math_block", mathBlock, { alt: ["paragraph", "reference", "blockquote", "list"] });
  container(md, "q", { validate: (params) => params.trim().length > 0 });
  return md;
}
