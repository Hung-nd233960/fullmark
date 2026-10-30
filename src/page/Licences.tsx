import { Icon } from "./icons";
import type { PageMessages } from "./questions/shared";

/** One package or font the page embeds. */
export type Notice = { name: string; version: string; licence: string; copyright: string };
/** What a page embeds and the licence texts it must carry (TECHNICAL_DESIGN.md, section 3, "Licences"). */
export type Licences = { notices: readonly Notice[]; mit: string; ofl: string | null };

/** The id of the popup, which the build writes after the page's root. */
export const LICENCES_ID = "fm-licences";

/** Opens the popup; the first time it also wires the close button, a click on the backdrop and the return of the focus. */
export function openLicences(): void {
  const dialog = document.getElementById(LICENCES_ID) as HTMLDialogElement | null;
  if (dialog === null || typeof dialog.showModal !== "function") return;
  if (dialog.dataset.wired === undefined) {
    dialog.dataset.wired = "true";
    dialog.addEventListener("click", (event) => {
      // the dialog's own box is its backdrop and padding-free edge: a click on the content has a child as its target
      if (event.target === dialog) dialog.close();
    });
    dialog.addEventListener("close", () => document.querySelector<HTMLElement>("[data-action=licences]")?.focus());
  }
  dialog.showModal();
}

/** The small muted button at the foot of the page. */
export function LicencesButton({ t }: { t: PageMessages }) {
  return (
    <footer class="fm-foot">
      <button type="button" class="fm-licences-button" data-action="licences" onClick={openLicences}>
        <Icon name="info" size={14} />
        {t.licences}
      </button>
    </footer>
  );
}

/** The popup: each notice, then the MIT and OFL texts once each in a scrolling area. Rendered at build, no script needed. */
export function LicencesDialog({ t, licences }: { t: PageMessages; licences: Licences }) {
  return (
    <dialog id={LICENCES_ID} class="fm-licences" aria-labelledby="fm-licences-title">
      <div class="fm-licences-box">
        <div class="fm-licences-head">
          <h2 id="fm-licences-title">{t.licencesTitle}</h2>
          <form method="dialog">
            <button type="submit" class="fm-licences-close" aria-label={t.licencesClose} title={t.licencesClose}>
              <Icon name="cross" size={18} />
            </button>
          </form>
        </div>
        <p class="fm-licences-intro">{t.licencesIntro}</p>
        <ul class="fm-licences-list">
          {licences.notices.map((n) => (
            <li key={n.name}>
              <strong>{n.name}</strong>
              <span class="fm-licences-meta">{t.licenceLine(n.version, n.licence)}</span>
              <span class="fm-licences-copy">{n.copyright}</span>
            </li>
          ))}
        </ul>
        {/* biome-ignore lint/a11y/noNoninteractiveTabindex: a scrolling area must be reachable from the keyboard */}
        <section class="fm-licences-texts" aria-label={t.licencesTexts} tabIndex={0}>
          <h3>{t.licenceMitHeading}</h3>
          <pre>{licences.mit}</pre>
          {licences.ofl === null ? null : (
            <>
              <h3>{t.licenceOflHeading}</h3>
              <pre>{licences.ofl}</pre>
            </>
          )}
        </section>
      </div>
    </dialog>
  );
}
