import { sha256 } from "@noble/hashes/sha2.js";
import { utf8ToBytes } from "@noble/hashes/utils.js";
import { toBase64 } from "../core/keyblob";
import { deviceThemeCss } from "../core/themes";

/**
 * The two things only `build --watch --serve` makes (COMMANDS.md, `--serve`; G31, G33): a built page with the reload
 * code added, and the index of several pages. Pure: the same input gives the same bytes. The page on disk never goes
 * through here, so it stays byte-identical to `build`'s.
 */

const sha256Source = (text: string): string => `'sha256-${toBase64(sha256(utf8ToBytes(text)))}'`;

const CSP_TAG = '<meta http-equiv="Content-Security-Policy" content="';
const ICON = '<link rel="icon" href="data:,">';

/**
 * The served copy of a built page or paper: the reload script before `</body>`, its hash in the CSP's `script-src`
 * (replacing `'none'` on a paper) and `connect-src 'self'` for the event stream. Throws when the page is not one
 * `build` made, so a changed CSP is noticed by the byte-identity test, not by a page that quietly never reloads.
 */
export function withReload(html: string, reload: string): string {
  if (reload.toLowerCase().includes("</script")) throw new Error("the reload code holds a closing script tag");
  const start = html.indexOf(CSP_TAG);
  const body = html.lastIndexOf("</body>");
  if (start < 0 || body < 0) throw new Error("not a page that build wrote: no CSP or no body");
  const from = start + CSP_TAG.length;
  const to = html.indexOf('"', from);
  const policy = html.slice(from, to);
  const scripts = /(^|; )script-src ([^;]*)/.exec(policy);
  if (scripts === null || policy.includes("connect-src")) throw new Error("not a page that build wrote: its CSP");
  const sources = scripts[2] === "'none'" ? sha256Source(reload) : `${scripts[2]} ${sha256Source(reload)}`;
  const changed = `${policy.slice(0, scripts.index)}${scripts[1]}script-src ${sources}${policy.slice(scripts.index + scripts[0].length)}; connect-src 'self'`;
  // the empty icon after the CSP tag, as on a one-shot served page: no request for /favicon.ico
  const tagEnd = html.indexOf(">", to) + 1;
  return `${html.slice(0, from)}${changed}${html.slice(to, tagEnd)}\n${ICON}${html.slice(tagEnd, body)}<script>${reload}</script>\n${html.slice(body)}`;
}

/** One line of the index: a quiz page and how its last build went. */
export type IndexEntry = {
  title: string;
  /** the source file as the user named it */
  file: string;
  /** the page's name under the token, `quiz.html`; null when no build has succeeded yet (nothing to link to) */
  href: string | null;
  /** the last build failed: the terminal has the errors */
  failed: boolean;
};

const TEXT = {
  en: {
    title: "Quizzes being built",
    intro: "Each page reloads when its quiz is saved.",
    failed: "last build failed: see the terminal",
    none: "not built yet",
  },
  vi: {
    title: "Các bài đang được dựng",
    intro: "Mỗi trang tải lại khi bài của nó được lưu.",
    failed: "lần dựng gần nhất bị lỗi: xem trong terminal",
    none: "chưa dựng xong",
  },
} as const;

const escapeHtml = (text: string): string =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

const INDEX_CSS =
  "body{margin:0;background:var(--bg);color:var(--text);font-family:var(--font);line-height:1.6}" +
  "main{max-width:42rem;margin:0 auto;padding:2rem 1rem}" +
  "h1{font-size:1.5rem;margin:0 0 .5rem}p{color:var(--muted);margin:0 0 1.5rem}" +
  "ul{list-style:none;margin:0;padding:0;display:grid;gap:.75rem}" +
  "li{background:var(--card);border:1px solid var(--card-line);border-radius:var(--card-radius);padding:.75rem 1rem}" +
  "a{color:var(--accent);font-weight:600;text-decoration:none}a:hover{text-decoration:underline}" +
  "a:focus-visible{outline:3px solid var(--accent);outline-offset:2px}" +
  ".file{display:block;color:var(--muted);font-size:.875rem}" +
  ".note{display:block;color:var(--bad);font-size:.875rem;margin-top:.25rem}";

/**
 * The index served at `/<token>/` when several files are built: each quiz's title as a link, its file name, and a note
 * after a failed rebuild. The page's tokens in both themes, its language `ui` (`--ui-lang`, else `en`), and no script
 * but the reload code, whose hash is in the CSP.
 */
export function buildIndex(entries: readonly IndexEntry[], ui: "en" | "vi", reload: string): string {
  if (reload.toLowerCase().includes("</script")) throw new Error("the reload code holds a closing script tag");
  const t = TEXT[ui];
  const css = deviceThemeCss() + INDEX_CSS;
  const csp = [
    "default-src 'none'",
    `script-src ${sha256Source(reload)}`,
    `style-src ${sha256Source(css)}`,
    "base-uri 'none'",
    "form-action 'none'",
    "connect-src 'self'",
  ].join("; ");
  const items = entries.map((e) => {
    const name = escapeHtml(e.title);
    const head = e.href === null ? `<strong>${name}</strong>` : `<a href="${escapeHtml(e.href)}">${name}</a>`;
    const note = e.failed
      ? `<span class="note">${t.failed}</span>`
      : e.href === null
        ? `<span class="note">${t.none}</span>`
        : "";
    return `<li>${head}<span class="file">${escapeHtml(e.file)}</span>${note}</li>`;
  });
  return [
    "<!doctype html>",
    `<html lang="${ui}">`,
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<meta http-equiv="Content-Security-Policy" content="${escapeHtml(csp)}">`,
    `<title>${t.title}</title>`,
    ICON,
    `<style>${css}</style>`,
    "</head>",
    "<body>",
    `<main><h1>${t.title}</h1><p>${t.intro}</p><ul>${items.join("")}</ul></main>`,
    `<script>${reload}</script>`,
    "</body>",
    "</html>",
    "",
  ].join("\n");
}
