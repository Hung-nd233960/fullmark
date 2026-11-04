import { effect } from "@preact/signals";
import { render } from "preact";
import { applyLook } from "../page/look";
import type { ReviewData } from "./data";
import { Form } from "./Form";
import { installKeys } from "./keys";
import { createFormLook } from "./look";
import { createFormState } from "./state";

/**
 * The review form's entry (bundled by `scripts/build-page.mjs` into `dist/review.js`, an IIFE of its own beside
 * `dist/serve.js`). It reads the data block, draws the form into the empty root and keeps the document's `lang` and
 * title as the page has them. The saved review is the server's: the form keeps nothing of its own.
 */
const dataElement = document.getElementById("fm-data");
const root = document.getElementById("fm-root");
if (dataElement && root) {
  const data = JSON.parse(dataElement.textContent ?? "") as ReviewData;
  const store = { look: createFormLook(data.page), screen: { phone: { value: false } } };
  applyLook(store);
  const state = createFormState(data);
  render(<Form state={state} store={store} data={data} />, root);
  installKeys(state, store);
  // the saved card replaces the questions: the page goes back to the top so the card is seen
  effect(() => {
    if (state.saved.value !== null) window.scrollTo(0, 0);
  });
  (window as unknown as { fullmarkReview: unknown }).fullmarkReview = { ready: true };
}
