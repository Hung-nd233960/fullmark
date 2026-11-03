/**
 * The reload code of `quiz build --watch --serve` (TECHNICAL_DESIGN.md, foundation 9; COMMANDS.md, `--serve`), built to
 * `dist/reload.js`: a few hundred bytes, added only to the copy of a page that the reload server holds in memory. It
 * takes no submit and keeps no state. The server sends `reload` with the path (under the token) of the page it rebuilt:
 * a page reloads for its own path, and the index (the root, which lists every page) for any. `EventSource` reconnects
 * by itself when the stream drops.
 */
const here = location.pathname.split("/").pop() ?? "";
new EventSource("./events").addEventListener("reload", (event) => {
  const page = (event as MessageEvent<string>).data;
  if (here === "" || page === here) location.reload();
});
