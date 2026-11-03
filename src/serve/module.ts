/**
 * The browser half of the one-shot server (TECHNICAL_DESIGN.md, section 7, foundation 9), built to `dist/serve.js` and
 * added only to a page that `quiz serve` builds in memory. It listens to the page's attach point: on `submit` it posts
 * the attempt to `./submit` (the page's own address, with the token in it) and tells the page whether the server took
 * it (`sent` or `send-failed`); the page core says what that means to the learner, in its own catalogs. With
 * `--autosave` it also posts each `progress` to `./progress`, the latest one only, one request at a time.
 */
type Attempt = { phase: string };
type PageEvent = { quizId: string; attempt: Attempt };
type Events = {
  on(name: "submit" | "progress", listener: (event: PageEvent) => void): unknown;
  emit(name: "sent" | "send-failed", event: { quizId: string }): void;
};

const post = (path: string, quizId: string, attempt: Attempt): Promise<Response> =>
  fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ quizId, attempt }),
  });

const fullmark = (window as unknown as { fullmark?: { events?: Events; autosave?: boolean } }).fullmark;
const events = fullmark?.events;

events?.on("submit", ({ quizId, attempt }) => {
  post("./submit", quizId, attempt).then(
    (response) => events.emit(response.ok ? "sent" : "send-failed", { quizId }),
    () => events.emit("send-failed", { quizId }),
  );
});

if (fullmark?.autosave === true) {
  let latest: PageEvent | null = null;
  let sending = false;
  const flush = (): void => {
    if (sending || latest === null) return;
    const { quizId, attempt } = latest;
    latest = null;
    sending = true;
    // a refused or lost progress post is not shown: the next one carries everything, and Submit says if it fails
    post("./progress", quizId, attempt)
      .catch(() => undefined)
      .finally(() => {
        sending = false;
        flush();
      });
  };
  events?.on("progress", (event) => {
    // the submitted attempt goes by `submit`; the server keeps nothing of it
    if (event.attempt.phase !== "answering") return;
    latest = event;
    flush();
  });
}
