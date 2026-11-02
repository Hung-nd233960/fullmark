import { Fragment } from "preact";
import { Icon } from "./icons";
import { tabKeys } from "./Materials";
import type { PageMessages } from "./questions/shared";

/** One package or font the page embeds. */
export type Notice = { name: string; version: string; licence: string; copyright: string };
/** What a page embeds and the licence texts it must carry (TECHNICAL_DESIGN.md, section 3, "Licences"). */
export type Licences = {
  notices: readonly Notice[];
  texts: readonly { licence: string; body: string }[];
};

/**
 * What the Information tab lists: build inputs only, so two builds of one quiz stay byte-identical. Never the Node
 * version, the operating system, a path or the user's name. An option left at its default is `null`.
 */
export type BuildInfo = {
  fullmark: string;
  /** the short version: the first 4 characters of the quiz hash */
  quiz: string;
  builtAt: string;
  /** what shapes the page: Preact, KaTeX with maths, Shiki with highlighted code, each embedded font */
  packages: readonly { name: string; version: string }[];
  options: {
    profile: string | null;
    fonts: string | null;
    uiLang: string | null;
    theme: string;
    look: string;
    strict: boolean;
  };
};

/** The id of the popup, which the build writes after the page's root. */
export const LICENCES_ID = "fm-licences";

/** Opens the popup; the first time it also wires the close button, a click on the backdrop and the return of the focus. */
export function openLicences(): void {
  const dialog = document.getElementById(LICENCES_ID) as HTMLDialogElement | null;
  if (dialog === null || typeof dialog.showModal !== "function") return;
  const tabs = [...dialog.querySelectorAll<HTMLElement>("[data-info-tab]")];
  const show = (name: string): void => {
    for (const tab of tabs) {
      const on = tab.dataset.infoTab === name;
      tab.setAttribute("aria-selected", String(on));
      tab.tabIndex = on ? 0 : -1;
      const panel = dialog.querySelector<HTMLElement>(`[data-info-panel=${tab.dataset.infoTab}]`);
      if (panel !== null) panel.hidden = !on;
    }
  };
  if (dialog.dataset.wired === undefined) {
    dialog.dataset.wired = "true";
    for (const tab of tabs) tab.addEventListener("click", () => show(tab.dataset.infoTab ?? "info"));
    dialog.querySelector<HTMLElement>("[role=tablist]")?.addEventListener("keydown", (e) => tabKeys(e));
    dialog.addEventListener("click", (event) => {
      // the dialog's own box is its backdrop and padding-free edge: a click on the content has a child as its target
      if (event.target === dialog) dialog.close();
    });
    dialog.addEventListener("close", () => document.querySelector<HTMLElement>("[data-action=licences]")?.focus());
  }
  show("info");
  dialog.showModal();
}

/** The ⓘ icon at the foot of the page, bottom right; "Licences" is its accessible name and tooltip. */
export function LicencesButton({ t }: { t: PageMessages }) {
  return (
    <footer class="fm-foot">
      <button
        type="button"
        class="fm-licences-button"
        data-action="licences"
        aria-label={t.licences}
        title={t.licences}
        onClick={openLicences}
      >
        <Icon name="info" size={18} />
      </button>
    </footer>
  );
}

const TABS = ["info", "licences"] as const;

/** One row of the Information tab: a name and its value. */
const Row = ({ label, value }: { label: string; value: string }) => (
  <div class="fm-info-row">
    <dt>{label}</dt>
    <dd>{value}</dd>
  </div>
);

/** The Information tab: the build inputs, as a list of names and values. */
function InfoPanel({ t, info }: { t: PageMessages; info: BuildInfo }) {
  const orDefault = (value: string, fallback: string): string =>
    value === fallback ? `${value} (${t.infoDefault})` : value;
  const given = (value: string | null): string => value ?? t.infoDefault;
  return (
    <div id="fm-info-panel" role="tabpanel" aria-labelledby="fm-info-tab" data-info-panel="info">
      <p class="fm-licences-intro">{t.infoIntro}</p>
      <dl class="fm-info-list">
        <Row label={t.infoFullmark} value={info.fullmark} />
        <Row label={t.infoQuiz} value={info.quiz} />
        <Row label={t.infoBuilt} value={info.builtAt} />
        <Row label={t.infoMadeWith} value={info.packages.map((p) => `${p.name} ${p.version}`).join(", ")} />
        <Row label={t.infoProfile} value={given(info.options.profile)} />
        <Row label={t.infoFonts} value={given(info.options.fonts)} />
        <Row label={t.infoUiLang} value={given(info.options.uiLang)} />
        <Row label={t.infoTheme} value={orDefault(info.options.theme, "auto")} />
        <Row label={t.infoLook} value={orDefault(info.options.look, "free")} />
        <Row label={t.infoStrict} value={info.options.strict ? t.infoOn : `${t.infoOff} (${t.infoDefault})`} />
      </dl>
    </div>
  );
}

/**
 * The popup: two tabs, Information (build inputs) and Licences (each notice, then each distinct licence text once in a
 * scrolling area). Rendered at build, so it needs no script to be read; the runtime only switches the tabs.
 */
export function LicencesDialog({ t, licences, info }: { t: PageMessages; licences: Licences; info: BuildInfo }) {
  const names = { info: t.infoTab, licences: t.licencesTab };
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
        <div class="fm-licences-tabs" role="tablist" aria-label={t.infoTabs}>
          {TABS.map((name, i) => (
            <button
              key={name}
              type="button"
              role="tab"
              id={`fm-${name}-tab`}
              class="fm-licences-tab"
              data-info-tab={name}
              aria-selected={i === 0}
              aria-controls={`fm-${name}-panel`}
              tabIndex={i === 0 ? 0 : -1}
            >
              {names[name]}
            </button>
          ))}
        </div>
        <InfoPanel t={t} info={info} />
        <div id="fm-licences-panel" role="tabpanel" aria-labelledby="fm-licences-tab" data-info-panel="licences" hidden>
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
            {licences.texts.map((text) => (
              <Fragment key={text.body}>
                <h3>
                  {text.licence === "MIT"
                    ? t.licenceMitHeading
                    : text.licence === "OFL-1.1"
                      ? t.licenceOflHeading
                      : text.licence}
                </h3>
                <pre>{text.body}</pre>
              </Fragment>
            ))}
          </section>
        </div>
      </div>
    </dialog>
  );
}
