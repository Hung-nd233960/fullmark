import { serveMessagesFor } from "./messages";

/**
 * The browser half of the one-shot server (TECHNICAL_DESIGN.md, section 7, foundation 9), built to `dist/serve.js` and
 * added only to a page that `quiz serve` builds in memory. It listens to the page's attach point: on `submit` it posts
 * the attempt to `./submit` (the page's own address, with the token in it) and says whether the server took it. On
 * `progress` it does nothing yet. The page core knows nothing of it.
 */
type Attempt = unknown;
type Events = {
  on(name: "submit", listener: (event: { quizId: string; attempt: Attempt }) => void): unknown;
  on(name: "progress", listener: (event: { quizId: string; attempt: Attempt }) => void): unknown;
};

/** The message sits on the page in the notice style; the CSP forbids a style attribute, so its position is set through the DOM. */
function say(text: string, good: boolean): void {
  document.querySelector("[data-fm-serve]")?.remove();
  const note = document.createElement("p");
  note.className = "fm-notice";
  note.setAttribute("data-fm-serve", good ? "sent" : "failed");
  note.setAttribute("role", good ? "status" : "alert");
  note.textContent = text;
  const style = note.style;
  style.position = "fixed";
  style.left = "16px";
  style.right = "16px";
  style.bottom = "16px";
  style.maxWidth = "36rem";
  style.margin = "0 auto";
  style.zIndex = "50";
  style.background = "var(--card)";
  style.border = "1px solid var(--line)";
  style.borderLeft = `3px solid ${good ? "var(--ok)" : "var(--bad)"}`;
  style.color = good ? "var(--ok)" : "var(--bad)";
  document.body.append(note);
}

async function send(quizId: string, attempt: Attempt): Promise<void> {
  const t = serveMessagesFor(document.documentElement.lang);
  try {
    const response = await fetch("./submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quizId, attempt }),
    });
    say(response.ok ? t.sent : t.failed, response.ok);
  } catch {
    say(t.failed, false);
  }
}

const events = (window as unknown as { fullmark?: { events?: Events } }).fullmark?.events;
events?.on("submit", ({ quizId, attempt }) => {
  void send(quizId, attempt);
});
// `progress` is for `--autosave` (a later slice): nothing listens yet
