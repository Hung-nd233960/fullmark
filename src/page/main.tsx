import { hydrate } from "preact";
import { App } from "./App";
import type { PageData } from "./data";
import { createStore } from "./store";

/**
 * The page runtime's entry (bundled by `scripts/build-page.mjs` into one IIFE). It reads the data block, hydrates the
 * tree the build rendered and announces itself on the attach point. It knows nothing about a server.
 */
const dataElement = document.getElementById("fm-data");
const root = document.getElementById("fm-root");
if (dataElement && root) {
  const data = JSON.parse(dataElement.textContent ?? "") as PageData;
  const store = createStore(data);
  hydrate(<App store={store} />, root);
  (window as unknown as { fullmark: unknown }).fullmark = { events: store.events };
  store.events.emit("ready", { quizIds: [...store.quizzes.keys()] });
}
