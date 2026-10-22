/* fullmark runtime: plain ES2020, no dependencies, no network. */
(() => {
  // =====================================================================
  // Grading (mirrors src/fullmark/grading.py; both are tested on tests/grading_cases.json)
  // =====================================================================
  const EPS = 1e-9;
  const NUM = "[+-]?(?:[0-9]+(?:\\.[0-9]*)?|\\.[0-9]+)(?:[eE][+-]?[0-9]+)?";
  const NUM_RE = new RegExp("^" + NUM + "$");
  const FRAC_RE = new RegExp("^(" + NUM + ")\\s*/\\s*(" + NUM + ")$");

  // Blanks grow with their text. Browsers without CSS field-sizing get a width in ch; CSS min/max still clamp it.
  const HAS_FIELD_SIZING = CSS.supports("field-sizing", "content");
  const sizeBlank = (el) => (el.style.width = el.value.length + 2 + "ch");

  function round2(x) {
    return Math.floor(x * 100 + 0.5 + EPS) / 100;
  }

  function parseNumber(text) {
    const s = String(text).trim().replace(/−/g, "-");
    if (NUM_RE.test(s)) return Number(s);
    const m = FRAC_RE.exec(s);
    if (m) {
      const den = Number(m[2]);
      if (den !== 0) return Number(m[1]) / den;
    }
    return null;
  }

  function normalizeText(text, kase) {
    const s = String(text).trim().replace(/\s+/g, " ");
    return kase === "sensitive" ? s : s.toLowerCase();
  }

  function matchText(text, accept, patterns, kase) {
    const s = normalizeText(text, kase);
    if (!s) return false;
    if (accept.some((a) => s === normalizeText(a, kase))) return true;
    const flags = kase === "sensitive" ? "" : "i";
    return patterns.some((p) => new RegExp("^(?:" + p + ")$", flags).test(s));
  }

  function matchNumber(raw, values, tolerance, relTolerance) {
    const x = parseNumber(raw);
    if (x === null) return false;
    return values.some((t) => {
      const allowed = relTolerance !== null && relTolerance !== undefined ? relTolerance * Math.abs(t) : tolerance || 0;
      return Math.abs(x - t) <= allowed + EPS;
    });
  }

  const res = (earned, status, extra) => Object.assign({ earned, status }, extra || {});

  function scored(points, share, answered) {
    if (!answered) return res(0, "unanswered");
    const earned = round2(points * share);
    if (earned >= points - EPS) return res(points, "correct");
    return res(earned, earned > 0 ? "partial" : "incorrect");
  }

  function textOf(response, key) {
    if (!response) return "";
    const v = response[key || "text"];
    return typeof v === "string" ? v : "";
  }

  function shareOf(results, spec) {
    if ((spec.scoring || "partial") === "all_or_nothing") return results.every(Boolean) ? 1 : 0;
    return results.filter(Boolean).length / results.length;
  }

  function blankOk(blank, text, kase) {
    if (blank.numeric) return matchNumber(text, [blank.value], blank.tolerance, null);
    return matchText(text, blank.accept, [], kase);
  }

  function gradeFields(spec, response, kase) {
    const fields = spec.fields;
    const given = response && response.fields ? response.fields.slice() : [];
    while (given.length < fields.length) given.push("");
    const graded = [];
    fields.forEach((f, i) => {
      if (f.kind !== "none") graded.push(i);
    });
    const filled = (i) => String(given[i] || "").trim() !== "";
    if (!graded.length) return res(null, given.some((_, i) => filled(i)) ? "pending" : "unanswered");

    let explicit = 0;
    const unset = [];
    graded.forEach((i) => {
      if (fields[i].points !== null && fields[i].points !== undefined) explicit += fields[i].points;
      else unset.push(i);
    });
    const share = unset.length ? Math.max(spec.points - explicit, 0) / unset.length : 0;
    const weight = {};
    let total = 0;
    graded.forEach((i) => {
      weight[i] = fields[i].points !== null && fields[i].points !== undefined ? fields[i].points : share;
      total += weight[i];
    });
    const results = fields.map(() => null);
    graded.forEach((i) => {
      const f = fields[i];
      const text = String(given[i] || "");
      results[i] =
        f.kind === "numeric"
          ? matchNumber(text, f.values, f.tolerance, f.rel_tolerance)
          : matchText(text, f.accept, f.patterns, kase);
    });
    const answered = graded.some((i) => filled(i));
    let got = 0;
    graded.forEach((i) => {
      if (results[i]) got += weight[i];
    });
    const out = scored(spec.points, total ? got / total : 0, answered);
    out.results = results;
    return out;
  }

  // Ungraded questions collect an answer: "ungraded" when given, else "unanswered".
  // earned is always null, so nothing counts toward any total.
  function gradeUngraded(type, spec, response) {
    const r = response || {};
    let answered;
    switch (type) {
      case "single":
        answered = r.choice !== null && r.choice !== undefined;
        break;
      case "multi":
        answered = Array.isArray(r.choices) && r.choices.length > 0;
        break;
      case "short":
      case "essay":
        answered = textOf(response, "text").trim() !== "";
        break;
      case "fields":
        answered = Array.isArray(r.fields) && r.fields.some((g) => String(g || "").trim() !== "");
        break;
      case "ordering":
        answered = Array.isArray(r.order) && r.order.length === spec.n;
        break;
      case "scale":
        answered = Number.isInteger(r.value);
        break;
      default:
        throw new Error("question type " + type + " cannot be ungraded");
    }
    return res(null, answered ? "ungraded" : "unanswered");
  }

  function gradeQuestion(type, spec, response) {
    const points = spec.points;
    const kase = spec.case || "insensitive";
    if (spec.ungraded || type === "scale") return gradeUngraded(type, spec, response);
    switch (type) {
      case "essay":
        return res(null, textOf(response, "text").trim() ? "pending" : "unanswered");
      case "code":
        return res(null, textOf(response, "code").trim() ? "pending" : "unanswered");
      case "single": {
        const c = response ? response.choice : null;
        if (c === null || c === undefined) return res(0, "unanswered");
        return scored(points, c === spec.correct ? 1 : 0, true);
      }
      case "multi": {
        const chosen = new Set((response && response.choices) || []);
        if (!chosen.size) return res(0, "unanswered");
        const correct = new Set(spec.correct);
        let share;
        if ((spec.scoring || "partial") === "all_or_nothing") {
          share = chosen.size === correct.size && [...chosen].every((c) => correct.has(c)) ? 1 : 0;
        } else {
          let right = 0;
          let wrong = 0;
          chosen.forEach((c) => (correct.has(c) ? right++ : wrong++));
          share = Math.max(0, (right - wrong) / correct.size);
        }
        return scored(points, share, true);
      }
      case "truefalse": {
        const v = response ? response.value : null;
        if (typeof v !== "boolean") return res(0, "unanswered");
        return scored(points, v === spec.value ? 1 : 0, true);
      }
      case "numeric": {
        const raw = textOf(response, "raw");
        if (!raw.trim()) return res(0, "unanswered");
        return scored(points, matchNumber(raw, spec.values, spec.tolerance, spec.rel_tolerance) ? 1 : 0, true);
      }
      case "short": {
        const t = textOf(response, "text");
        if (!t.trim()) return res(0, "unanswered");
        return scored(points, matchText(t, spec.accept, spec.patterns, kase) ? 1 : 0, true);
      }
      case "blanks": {
        const given = response && response.blanks ? response.blanks.slice() : [];
        while (given.length < spec.blanks.length) given.push("");
        const results = spec.blanks.map((b, i) => blankOk(b, String(given[i] || ""), kase));
        const answered = given.some((g) => String(g || "").trim() !== "");
        const out = scored(points, results.filter(Boolean).length / spec.blanks.length, answered);
        out.results = answered ? results : results.map(() => false);
        return out;
      }
      case "fields":
        return gradeFields(spec, response, kase);
      case "ordering": {
        const order = response ? response.order : null;
        if (!Array.isArray(order) || order.length !== spec.n) return res(0, "unanswered");
        const results = order.map((item, pos) => item === pos);
        const out = scored(points, shareOf(results, spec), true);
        out.results = results;
        return out;
      }
      case "matching": {
        const given = response && response.pairs ? response.pairs.slice() : [];
        while (given.length < spec.answer.length) given.push(null);
        const results = spec.answer.map((a, i) => given[i] === a);
        const answered = given.some((g) => g !== null && g !== undefined);
        const out = scored(points, shareOf(results, spec), answered);
        out.results = answered ? results : results.map(() => false);
        return out;
      }
      default:
        throw new Error("unknown question type " + type);
    }
  }

  // =====================================================================
  // Small utilities
  // =====================================================================
  const AUTO = ["single", "multi", "truefalse", "numeric", "short", "blanks", "fields", "ordering", "matching"];

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === false || v === null || v === undefined) continue;
      if (k === "class") el.className = v;
      else if (k === "html") el.innerHTML = v;
      else if (k === "text") el.textContent = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat()) {
      if (kid === null || kid === undefined || kid === false) continue;
      el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }

  function mulberry32(seed) {
    let a = seed | 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return (t ^ (t >>> 14)) >>> 0;
    };
  }

  function hashString(s) {
    let x = 5381;
    for (let i = 0; i < s.length; i++) x = (Math.imul(x, 33) + s.charCodeAt(i)) | 0;
    return x >>> 0;
  }

  function shuffled(arr, seed) {
    const next = mulberry32(seed);
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = next() % (i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function decodeKey(blob, hashHex) {
    const next = mulberry32(parseInt(hashHex.slice(0, 8), 16));
    const bin = atob(blob.trim());
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i) ^ (next() & 0xff);
    return JSON.parse(new TextDecoder("utf-8").decode(bytes));
  }

  function wordCount(text) {
    return text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
  }

  function fmtClock(sec) {
    sec = Math.max(0, Math.floor(sec));
    const hh = Math.floor(sec / 3600);
    const mm = Math.floor((sec % 3600) / 60);
    const ss = sec % 60;
    const p = (n) => String(n).padStart(2, "0");
    return hh ? hh + ":" + p(mm) + ":" + p(ss) : p(mm) + ":" + p(ss);
  }

  function fmtSpan(sec) {
    sec = Math.round(sec);
    if (sec < 60) return sec + " s";
    const m = Math.floor(sec / 60);
    // drop a zero tail: "30 min", not "30 min 0 s"
    if (m < 60) return sec % 60 ? m + " min " + (sec % 60) + " s" : m + " min";
    return m % 60 ? Math.floor(m / 60) + " h " + (m % 60) + " min" : Math.floor(m / 60) + " h";
  }

  const iso = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
  const pts = (n) => String(round2(n)).replace(/\.0+$/, "");

  function store(op, key, val) {
    try {
      if (op === "get") return localStorage.getItem(key);
      if (op === "set") localStorage.setItem(key, val);
      if (op === "del") localStorage.removeItem(key);
    } catch {
      /* storage blocked: the quiz still works, just without resume */
    }
    return null;
  }

  // =====================================================================
  // App
  // =====================================================================
  function main() {
    const DATA = JSON.parse(document.getElementById("quiz-data").textContent);
    let KEY = null;
    try {
      KEY = decodeKey(document.getElementById("quiz-key").textContent, DATA.hash);
    } catch (e) {
      console.error("fullmark: cannot decode the answer key", e);
    }
    const SKEY = "fullmark:" + DATA.hash;
    const app = document.getElementById("app");
    const wrap = h("div", { class: "qm-wrap" });
    app.append(wrap);
    // Q holds the questions of the current attempt. With a question bank it is a
    // random draw (recorded in state.drawn); otherwise it is every question.
    const QALL = DATA.questions;
    const Q = [];
    const bank = DATA.bank || null;
    const SURVEY = DATA.mode === "survey";
    // A `quiz review` form: three questions per review card. Progress, the nav and
    // Finish count cards (the first question of each section is the verdict).
    const REVIEW = !!DATA.review;
    const reviewLead = (q) => REVIEW && QALL.find((x) => x.section === q.section) === q;
    const pillOf = (q) => pills[REVIEW ? QALL.find((x) => x.section === q.section).id : q.id];
    const cardCount = () => (REVIEW ? Q.filter(reviewLead).length : Q.length);
    const cardNumber = (q, fallback) => {
      const m = /^Question (\d+)/.exec((DATA.sections[q.section] || {}).title || "");
      return m ? +m[1] : fallback;
    };

    function drawIds(seed) {
      if (!bank) return QALL.map((q) => q.id);
      const take = (pool, n, salt) => {
        const ids = shuffled(pool, seed ^ hashString(salt))
          .slice(0, n)
          .map((q) => q.id);
        return ids;
      };
      let picked = [];
      if (bank.pick) {
        picked = take(QALL, bank.pick, "bank");
      } else {
        DATA.sections.forEach((sec, si) => {
          const pool = QALL.filter((q) => q.section === si);
          picked = picked.concat(sec.pick ? take(pool, sec.pick, "bank" + si) : pool.map((q) => q.id));
        });
      }
      const set = new Set(picked);
      return QALL.filter((q) => set.has(q.id)).map((q) => q.id);
    }

    function applyDraw(ids) {
      const set = new Set(ids);
      Q.length = 0;
      QALL.filter((q) => set.has(q.id)).forEach((q) => Q.push(q));
    }

    // What the start screen promises before anything is drawn.
    function nominal() {
      if (!bank) return { count: QALL.length, points: QALL.reduce((a, q) => a + q.points, 0), approx: false };
      const groups = [];
      if (bank.pick) groups.push([QALL, bank.pick]);
      else
        DATA.sections.forEach((sec, si) => {
          const pool = QALL.filter((q) => q.section === si);
          groups.push([pool, sec.pick || pool.length]);
        });
      let count = 0;
      let points = 0;
      let approx = false;
      for (const [pool, n] of groups) {
        if (!pool.length) continue;
        count += n;
        points += n * (pool.reduce((a, q) => a + q.points, 0) / pool.length);
        if (n < pool.length && pool.some((q) => q.points !== pool[0].points)) approx = true;
      }
      return { count, points: round2(points), approx };
    }

    const totalPoints = () => round2(Q.reduce((a, q) => a + (q.ungraded ? 0 : q.points), 0));
    const limit = DATA.time_limit;

    let state = fresh();
    function fresh() {
      return {
        started: false,
        startedAt: 0,
        savedAt: 0,
        seed: 0,
        drawn: null,
        retryOf: null,
        exported: false,
        answers: {},
        drafts: {}, // follow-up text by question id and choice index, kept while its field is hidden
        flags: {},
        checked: {},
        submitted: false,
        submittedAt: 0,
        timedOut: false,
        firstAnswered: {},
        lastChanged: {},
        changes: {},
      };
    }

    let saveTimer = null;
    function save(now) {
      clearTimeout(saveTimer);
      const write = () => {
        state.savedAt = Date.now();
        store("set", SKEY, JSON.stringify(state));
        pushProgress(!!now);
      };
      if (now) write();
      else saveTimer = setTimeout(write, 300);
    }
    window.addEventListener("pagehide", () => save(true));

    // `quiz serve --autosave` injects FULLMARK_SUBMIT.autosave (a URL) and, when the server holds
    // progress for this quiz, FULLMARK_SUBMIT.progress. From disk neither exists and nothing is sent.
    // Posts go one at a time, in order, so a late save never lands after the delete that follows
    // a submit.
    let progressChain = Promise.resolve();
    let progressWarned = false;
    function postProgress(body, leaving) {
      const target = window.FULLMARK_SUBMIT;
      if (!target || !target.autosave) return;
      const text = JSON.stringify(body);
      progressChain = progressChain
        .then(async () => {
          const res = await fetch(target.autosave, {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Fullmark-Token": target.token || "" },
            body: text,
            keepalive: !!leaving && text.length < 60000,
          });
          if (!res.ok) throw new Error("HTTP " + res.status);
        })
        .catch(() => {
          if (!progressWarned) {
            progressWarned = true;
            console.warn("fullmark: could not save progress to the server; it stays in this browser");
          }
        });
    }
    function pushProgress(leaving) {
      postProgress({ hash: DATA.hash, saved: state.savedAt, state: state.submitted ? null : state }, leaving);
    }
    function clearProgress() {
      if (window.FULLMARK_SUBMIT) window.FULLMARK_SUBMIT.progress = null;
      postProgress({ hash: DATA.hash, saved: Date.now(), state: null }, false);
    }

    function loadSaved() {
      const found = [];
      const raw = store("get", SKEY);
      if (raw) {
        try {
          const s = JSON.parse(raw);
          if (s && s.started) found.push(s);
        } catch {
          // ignore a damaged copy
        }
      }
      const server = window.FULLMARK_SUBMIT && window.FULLMARK_SUBMIT.progress;
      if (server && typeof server === "object" && server.started) found.push(server);
      if (!found.length) return null;
      let chosen = found[0]; // localStorage wins a tie
      for (const c of found.slice(1)) if ((c.savedAt || 0) > (chosen.savedAt || 0)) chosen = c;
      return Object.assign(fresh(), chosen);
    }

    // ---------- dialogs ----------
    function dialog(build) {
      return new Promise((resolve) => {
        const dlg = h("dialog", { class: "qm-dialog" });
        const close = (v) => {
          dlg.close();
          dlg.remove();
          resolve(v);
        };
        build(dlg, close);
        dlg.addEventListener("cancel", () => close(false));
        document.body.append(dlg);
        if (dlg.showModal) dlg.showModal();
        else dlg.setAttribute("open", "");
      });
    }

    function confirmDialog(message, okLabel) {
      return dialog((dlg, close) => {
        dlg.append(
          h("p", { text: message }),
          h(
            "div",
            { class: "qm-actions" },
            h("button", {
              class: "qm-btn",
              type: "button",
              text: "Cancel",
              onclick: () => close(false),
            }),
            h("button", {
              class: "qm-btn qm-btn-primary",
              type: "button",
              id: "dlg-ok",
              text: okLabel || "OK",
              onclick: () => close(true),
            }),
          ),
        );
      });
    }

    // ---------- math ----------
    function typeset(el) {
      if (typeof renderMathInElement !== "function") return;
      try {
        renderMathInElement(el, {
          delimiters: [
            { left: "\\[", right: "\\]", display: true },
            { left: "\\(", right: "\\)", display: false },
          ],
          throwOnError: false,
        });
      } catch (e) {
        console.error(e);
      }
      nameMathChoices(el);
    }

    // A choice made only of math has no text a screen reader can use from the label,
    // so give its input the TeX source as an accessible name.
    function nameMathChoices(el) {
      el.querySelectorAll(".qm-choice").forEach((row) => {
        const body = row.querySelector(".qm-choice-body");
        if (!body || !body.querySelector("math")) return;
        const clone = body.cloneNode(true);
        clone.querySelectorAll(".qm-math [aria-hidden='true']").forEach((e) => e.remove());
        clone.querySelectorAll("math").forEach((e) => {
          const tex = e.querySelector("annotation");
          e.replaceWith(document.createTextNode(tex ? " " + tex.textContent + " " : ""));
        });
        const name = clone.textContent.replace(/\s+/g, " ").trim();
        if (name) row.querySelector("input").setAttribute("aria-label", name);
      });
    }

    // ---------- theme ----------
    function toggleTheme() {
      const cur = document.documentElement.getAttribute("data-theme");
      const next = cur === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      store("set", "fullmark:theme", next);
      showThemeIcon(next);
    }
    // The icon shows the theme a click switches to: a sun in dark mode, a moon in light mode.
    const ICON_OPEN =
      '<svg viewBox="0 0 24 24" width="1.25em" height="1.25em" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">';
    const ICONS = {
      sun:
        ICON_OPEN +
        '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
      moon: ICON_OPEN + '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
    };
    function showThemeIcon(theme) {
      const dark = theme === "dark";
      themeBtn.innerHTML = dark ? ICONS.sun : ICONS.moon;
      const label = dark ? "Switch to light theme" : "Switch to dark theme";
      themeBtn.setAttribute("aria-label", label);
      themeBtn.title = label;
    }
    const themeBtn = h("button", {
      class: "qm-btn qm-btn-small qm-icon-btn",
      type: "button",
      id: "theme-btn",
      onclick: toggleTheme,
    });
    showThemeIcon(document.documentElement.getAttribute("data-theme"));
    if (DATA.theme !== "auto") themeBtn.hidden = true;

    // ---------- text size ----------
    // One CSS variable scales every rem length. The choice is a device preference,
    // so the key is not per quiz. The template reads it before first paint.
    const SCALES = [0.875, 1, 1.125, 1.25, 1.5];
    let scaleAt = SCALES.indexOf(parseFloat(store("get", "fullmark:fontscale")));
    if (scaleAt < 0) scaleAt = 1;
    function setScale(i) {
      scaleAt = Math.min(SCALES.length - 1, Math.max(0, i));
      document.documentElement.style.setProperty("--qm-scale", String(SCALES[scaleAt]));
      store("set", "fullmark:fontscale", String(SCALES[scaleAt]));
      smallerBtn.disabled = scaleAt === 0;
      largerBtn.disabled = scaleAt === SCALES.length - 1;
    }
    const smallerBtn = h("button", {
      class: "qm-btn qm-btn-small",
      type: "button",
      id: "font-smaller",
      text: "A−",
      "aria-label": "Smaller text",
      onclick: () => setScale(scaleAt - 1),
    });
    const largerBtn = h("button", {
      class: "qm-btn qm-btn-small",
      type: "button",
      id: "font-larger",
      text: "A+",
      "aria-label": "Larger text",
      onclick: () => setScale(scaleAt + 1),
    });
    setScale(scaleAt);

    // ---------- display menu ("Aa") ----------
    // One small button that opens a panel with text size and theme. The same node is
    // placed on the start screen and in the header, so only one exists at a time.
    const displayPop = h(
      "div",
      { class: "qm-aa-pop", id: "display-pop", role: "group", "aria-label": "Display settings", hidden: true },
      h(
        "div",
        { class: "qm-aa-row" },
        h("span", { text: "Text size" }),
        h("span", { class: "qm-aa-btns" }, smallerBtn, largerBtn),
      ),
      h("div", { class: "qm-aa-row", hidden: DATA.theme !== "auto" }, h("span", { text: "Theme" }), themeBtn),
    );
    const displayBtn = h("button", {
      class: "qm-btn qm-btn-small",
      type: "button",
      id: "display-btn",
      text: "Aa",
      title: "Display settings",
      "aria-label": "Display settings",
      "aria-expanded": "false",
      "aria-controls": "display-pop",
      onclick: () => setDisplayOpen(displayPop.hidden),
    });
    const displayMenu = h("span", { class: "qm-aa" }, displayBtn, displayPop);
    function setDisplayOpen(open, refocus) {
      displayPop.hidden = !open;
      displayBtn.setAttribute("aria-expanded", String(open));
      displayPop.style.translate = "";
      if (open) {
        // keep the panel inside the viewport on narrow screens
        const over = displayPop.getBoundingClientRect().right - (document.documentElement.clientWidth - 8);
        if (over > 0) displayPop.style.translate = -over + "px 0";
      } else if (refocus) displayBtn.focus();
    }
    if (!HAS_FIELD_SIZING) {
      document.addEventListener("input", (e) => e.target.classList.contains("qm-blank") && sizeBlank(e.target));
    }
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !displayPop.hidden) {
        e.stopPropagation();
        setDisplayOpen(false, true);
      }
    });
    document.addEventListener("click", (e) => {
      if (!displayPop.hidden && !displayMenu.contains(e.target)) setDisplayOpen(false);
    });

    // ---------- focus mode ----------
    // Fullscreen plus a clock, to keep a long quiz free of distractions. It is only a
    // layout: nothing is locked, and the quiz is never described as secure.
    const clockEl = h("div", { class: "qm-clock", id: "clock", role: "group", "aria-label": "Time" });
    let clockHandle = null;
    function showClock() {
      clockEl.textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    function setFocus(on) {
      document.body.classList.toggle("qm-focus", on);
      focusBtn.setAttribute("aria-pressed", String(on));
      clearInterval(clockHandle);
      clockHandle = null;
      if (on) {
        showClock();
        clockHandle = setInterval(showClock, 15000);
      }
    }
    async function toggleFocus() {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else {
          await document.documentElement.requestFullscreen();
          setFocus(!!document.fullscreenElement);
        }
      } catch {
        // fullscreen refused: stay in the normal layout
        setFocus(!!document.fullscreenElement);
      }
    }
    const focusBtn = h("button", {
      class: "qm-btn qm-btn-small",
      type: "button",
      id: "focus-btn",
      text: "Focus",
      "aria-pressed": "false",
      title: "Fullscreen with a clock",
      onclick: toggleFocus,
    });
    focusBtn.hidden = !document.fullscreenEnabled;
    document.addEventListener("fullscreenchange", () => setFocus(!!document.fullscreenElement));

    // =================================================================
    // Start screen
    // =================================================================
    function showStart() {
      setDisplayOpen(false);
      wrap.replaceChildren();
      const saved = loadSaved();
      const hasPoints = !SURVEY && nominal().points > 0;
      const box = h(
        "section",
        { class: "qm-start", id: "start-screen" },
        h("h1", { text: DATA.title }),
        DATA.description_html ? h("div", { class: "qm-prose", html: DATA.description_html }) : null,
        DATA.preamble_html ? h("div", { class: "qm-prose", html: DATA.preamble_html }) : null,
        h(
          "ul",
          { class: "qm-stats" },
          h(
            "li",
            null,
            h("strong", { text: nominal().count }),
            "questions" + (bank ? " (random draw from " + QALL.length + ")" : ""),
          ),
          hasPoints
            ? h("li", null, h("strong", { text: (nominal().approx ? "about " : "") + pts(nominal().points) }), "points")
            : null,
          h("li", null, h("strong", { text: limit ? fmtSpan(limit) : "No limit" }), "time limit"),
          SURVEY
            ? h("li", null, h("strong", { text: "No score" }), "answers are not graded")
            : h(
                "li",
                null,
                h("strong", { text: DATA.feedback === "instant" ? "Instant" : "After submit" }),
                "feedback",
              ),
        ),
      );
      if (saved) {
        box.append(
          h("p", {
            class: "qm-saved",
            text: saved.submitted
              ? "You have a finished attempt saved on this device."
              : "You have an attempt in progress on this device.",
          }),
        );
        box.append(
          h(
            "div",
            { class: "qm-actions" },
            h("button", {
              class: "qm-btn qm-btn-primary",
              id: "resume-btn",
              type: "button",
              text: saved.submitted ? "View results" : "Resume",
              onclick: () => {
                state = saved;
                applyDraw(state.drawn || drawIds(state.seed));
                showQuiz();
              },
            }),
            h("button", {
              class: "qm-btn",
              id: "restart-btn",
              type: "button",
              text: "Start over",
              onclick: async () => {
                if (await confirmDialog("Delete the saved attempt and start again?", "Start over")) {
                  store("del", SKEY);
                  clearProgress();
                  state = fresh();
                  showStart();
                }
              },
            }),
            displayMenu,
          ),
        );
      } else {
        box.append(
          h(
            "div",
            { class: "qm-actions" },
            h("button", {
              class: "qm-btn qm-btn-primary",
              id: "start-btn",
              type: "button",
              text: "Start",
              onclick: () => begin(),
            }),
            displayMenu,
          ),
        );
      }
      wrap.append(box);
      typeset(box);
    }

    function begin(retry) {
      const previous = state.startedAt;
      state = fresh();
      state.started = true;
      state.startedAt = Date.now();
      state.seed = state.startedAt >>> 0;
      state.drawn = retry && retry.length ? retry : drawIds(state.seed);
      if (retry && retry.length) state.retryOf = iso(previous);
      applyDraw(state.drawn);
      save(true);
      showQuiz();
    }

    // =================================================================
    // Quiz screen
    // =================================================================
    let order = [];
    let cards = {};
    let pills = {};
    let timerEl, progressEl, liveEl, submitBtn, exportBtn, resultsHost, tickHandle;
    let headerEl, actionsEl, panelEl, navSlot, scoreEl, pctEl, barEl, legendEl;

    function displayOrder() {
      const out = [];
      DATA.sections.forEach((sec, si) => {
        let qs = Q.filter((q) => q.section === si);
        if (!qs.length) return;
        if (DATA.shuffle_questions) qs = shuffled(qs, state.seed ^ hashString("sec" + si));
        out.push({ sec, si, qs });
      });
      return out;
    }

    function showQuiz() {
      setDisplayOpen(false);
      wrap.replaceChildren();
      cards = {};
      pills = {};
      timerEl = h("span", { class: "qm-timer", id: "timer", role: "timer" });
      progressEl = h("span", { class: "qm-progress", id: "progress" });
      liveEl = h("div", { class: "qm-sr-only", "aria-live": "polite", id: "live" });
      submitBtn = h("button", {
        class: "qm-btn qm-btn-primary qm-btn-small",
        id: "submit-btn",
        type: "button",
        text: SURVEY ? "Finish" : "Submit",
        onclick: onSubmit,
      });
      exportBtn = h("button", {
        class: "qm-btn qm-btn-small",
        id: "export-btn",
        type: "button",
        text: "Export answers",
        onclick: openExport,
      });
      const nav = h("nav", { class: "qm-nav", "aria-label": "Questions" });
      actionsEl = h("div", { class: "qm-header-actions" }, displayMenu, focusBtn, exportBtn, submitBtn);
      scoreEl = h("p", { class: "qm-panel-score", id: "panel-score", hidden: true });
      pctEl = h("span", { class: "qm-panel-pct" });
      barEl = h(
        "div",
        { class: "qm-bar", role: "progressbar", "aria-label": REVIEW ? "Cards reviewed" : "Questions answered" },
        h("div", { class: "qm-bar-fill" }),
      );
      legendEl = h("ul", { class: "qm-legend", "aria-label": "Key to the question buttons" });
      const legendOpen = store("get", "fullmark:legend") !== "closed";
      const legendBox = h(
        "details",
        {
          class: "qm-legend-box",
          open: legendOpen,
          ontoggle: (e) => {
            const now = e.target.open ? "open" : "closed";
            if (now !== (store("get", "fullmark:legend") || "open")) store("set", "fullmark:legend", now);
          },
        },
        h("summary", { text: "Key" }),
        legendEl,
      );
      const progressBlock = h("div", { class: "qm-panel-progress" }, progressEl, pctEl, barEl);
      navSlot = h("div", { class: "qm-panel-nav" });
      panelEl = h("aside", { class: "qm-panel", "aria-label": "Progress" }, scoreEl, progressBlock, navSlot, legendBox);
      headerEl = h(
        "header",
        { class: "qm-header" },
        h("span", { class: "qm-brand", text: "fullmark " + DATA.fullmark_version }),
        h("div", { class: "qm-header-row" }, h("h1", { class: "qm-header-title", text: DATA.title }), actionsEl),
        liveEl,
      );
      const header = headerEl;
      resultsHost = h("div", { id: "results-host" });
      const body = h("main", { id: "quiz-screen" });
      wrap.append(header, h("div", { class: "qm-layout" }, h("div", { class: "qm-main" }, resultsHost, body), panelEl));

      let n = 0;
      let cardsSeen = 0;
      order = [];
      for (const { sec, qs } of displayOrder()) {
        if (sec.title) {
          body.append(
            h(
              "h2",
              { class: "qm-section-title" },
              sec.title,
              sec.time ? h("span", { class: "qm-section-time", text: "  (suggested " + sec.time + ")" }) : null,
            ),
          );
        }
        if (sec.intro_html) body.append(h("div", { class: "qm-intro", html: sec.intro_html }));
        for (const q of qs) {
          n++;
          order.push(q);
          const card = buildCard(q, n);
          cards[q.id] = card;
          body.append(card);
          if (REVIEW && !reviewLead(q)) continue;
          const label = REVIEW ? cardNumber(q, ++cardsSeen) : n;
          const pill = h("button", {
            class: "qm-pill",
            type: "button",
            text: label,
            "data-label": (REVIEW ? "Go to review card " : "Go to question ") + label,
            onclick: () => card.scrollIntoView({ behavior: "smooth", block: "start" }),
          });
          pills[q.id] = pill;
          nav.append(pill);
        }
      }
      typeset(body);
      for (const q of Q) restoreCard(q);
      refreshAll();
      if (state.submitted) showResults();
      startTimer();
      // a long quiz gets one scrolling row of pills instead of many wrapped rows
      nav.classList.toggle("qm-nav-scroll", cardCount() > 20);
      // and in the wide panel, a grid of more than 40 pills (8 rows) scrolls on its own
      nav.classList.toggle("qm-nav-long", cardCount() > 40);
      navEl = nav;
      layoutPanel();
      wideMq.onchange = layoutPanel;
      watchHeaderHeight(header);
    }

    // The progress panel is rendered once. On a wide screen the timer, the progress
    // text and the pill nav are moved into it; below the breakpoint they go back to
    // the header (one scrolling row of pills). No element is ever duplicated.
    // Keep this query equal to the min-width media query in quiz.css.
    const wideMq = window.matchMedia("(min-width: 1000px)");
    let navEl = null;
    function layoutPanel() {
      if (!navEl) return;
      if (wideMq.matches) {
        panelEl.prepend(clockEl, timerEl);
        panelEl.querySelector(".qm-panel-progress").prepend(progressEl);
        navSlot.append(navEl);
      } else {
        actionsEl.before(clockEl, timerEl, progressEl);
        headerEl.insertBefore(navEl, liveEl);
      }
      trackCurrent(navEl, headerEl);
    }

    // the panel sticks just below the header, whatever its height
    let headerObserver = null;
    function watchHeaderHeight(header) {
      const set = () => document.documentElement.style.setProperty("--qm-header-h", header.offsetHeight + "px");
      set();
      if (headerObserver) headerObserver.disconnect();
      if (window.ResizeObserver) {
        headerObserver = new ResizeObserver(set);
        headerObserver.observe(header);
      }
    }

    // Marks the pill of the question being read and keeps it in view in a scrolling nav.
    let scrollHandler = null;
    function trackCurrent(nav, header) {
      if (scrollHandler) window.removeEventListener("scroll", scrollHandler);
      Object.values(pills).forEach((el) => el.removeAttribute("aria-current"));
      let current = null;
      let queued = false;
      const update = () => {
        queued = false;
        const line = header.getBoundingClientRect().bottom + 24;
        let found = order[0];
        for (const q of order) {
          const top = cards[q.id].getBoundingClientRect().top;
          if (cards[q.id].hidden) continue;
          if (top <= line) found = q;
          else break;
        }
        if (!found || found === current) return;
        if (current) pillOf(current).removeAttribute("aria-current");
        current = found;
        const p = pillOf(found);
        p.setAttribute("aria-current", "true");
        const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        if (panelEl.contains(p)) {
          // wide layout: a long pill grid scrolls by itself, otherwise the panel does
          const box = nav.scrollHeight > nav.clientHeight ? nav : panelEl;
          const edge = box.getBoundingClientRect();
          const at = p.getBoundingClientRect();
          if (at.top < edge.top || at.bottom > edge.bottom)
            box.scrollTo({
              top: box.scrollTop + at.top - edge.top - (box.clientHeight - p.offsetHeight) / 2,
              behavior: calm ? "auto" : "smooth",
            });
        } else if (nav.scrollWidth > nav.clientWidth) {
          nav.scrollTo({
            left: Math.max(0, p.offsetLeft - (nav.clientWidth - p.offsetWidth) / 2),
            behavior: calm ? "auto" : "smooth",
          });
        }
      };
      scrollHandler = () => {
        if (!queued) {
          queued = true;
          requestAnimationFrame(update);
        }
      };
      window.addEventListener("scroll", scrollHandler, { passive: true });
      update();
    }

    // ---------- cards ----------
    function buildCard(q, number) {
      const tags = q.tags.map((t) => h("span", { class: "qm-tag", text: t }));
      const flag = h("input", {
        type: "checkbox",
        "aria-label": "Flag question " + number + " for review",
      });
      flag.addEventListener("change", () => {
        if (flag.checked) state.flags[q.id] = 1;
        else delete state.flags[q.id];
        refreshPill(q);
        save();
      });
      const card = h(
        "article",
        { class: "qm-card", id: "card-" + q.id, "data-id": q.id, "data-type": q.type },
        h(
          "div",
          { class: "qm-card-head" },
          h("span", { class: "qm-num", text: "Q" + number }),
          q.ungraded
            ? SURVEY
              ? null
              : h("span", { class: "qm-points qm-unscored", text: "Not scored" })
            : h("span", {
                class: "qm-points",
                text: pts(q.points) + (q.points === 1 ? " pt" : " pts"),
              }),
          tags,
          REVIEW ? null : h("label", { class: "qm-flag" }, flag, " Flag for review"),
        ),
        h(
          "div",
          { class: "qm-prompt" },
          h("div", { class: "qm-title", id: "t-" + q.id, html: q.title_html }),
          q.prompt_html ? h("div", { class: "qm-body", html: q.prompt_html }) : null,
        ),
      );
      if (q.hint_html) {
        const body = h("div", { class: "qm-hint-body", html: q.hint_html, hidden: true });
        const btn = h("button", {
          class: "qm-btn qm-btn-small",
          type: "button",
          text: "Show hint",
          "aria-expanded": "false",
        });
        btn.addEventListener("click", () => {
          body.hidden = !body.hidden;
          btn.textContent = body.hidden ? "Show hint" : "Hide hint";
          btn.setAttribute("aria-expanded", String(!body.hidden));
          if (!body.hidden) typeset(body);
        });
        card.append(h("div", { class: "qm-hint" }, btn, body));
      }
      const answer = h("div", { class: "qm-answer" });
      buildAnswer(q, card, answer);
      card.append(answer);
      const checkable = DATA.feedback === "instant" && AUTO.includes(q.type) && !q.ungraded;
      if (checkable) {
        card.append(
          h(
            "div",
            { class: "qm-actions" },
            h("button", {
              class: "qm-btn qm-check",
              type: "button",
              text: "Check",
              onclick: () => checkQuestion(q),
            }),
          ),
        );
      }
      card.append(h("div", { class: "qm-feedback-host", "aria-live": "polite" }));
      if (checkable) {
        // Enter in a one-line field checks the question; textareas keep their newline
        card.addEventListener("keydown", (e) => {
          if (e.key !== "Enter" || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey || e.isComposing) return;
          if (e.target.tagName !== "INPUT" || ["radio", "checkbox"].includes(e.target.type)) return;
          e.preventDefault();
          checkQuestion(q);
        });
      }
      card.addEventListener("input", () => onChange(q));
      card.addEventListener("change", () => onChange(q));
      return card;
    }

    function htmlText(html) {
      const d = document.createElement("div");
      d.innerHTML = html;
      return d.textContent.trim();
    }

    // The shuffled display order of an ordering list (or matching's right-hand side).
    // Seeded, so a resume shows the same order; never the correct order itself.
    function orderIndexes(q, n, salt) {
      const idxs = Array.from({ length: n || q.items.length }, (_, i) => i);
      const seed = state.seed ^ hashString(q.id + (salt || ""));
      for (let k = 0; k < 20; k++) {
        const s = shuffled(idxs, seed + k);
        if (idxs.length < 2 || s.some((v, i) => v !== i)) return s;
      }
      return idxs.slice(1).concat(idxs[0]);
    }

    function orderRow(q, list, i) {
      const label = htmlText(q.items[i]);
      const move = (dir, text) =>
        h("button", {
          class: "qm-btn qm-btn-small qm-move",
          type: "button",
          "data-dir": dir,
          "aria-label": (dir < 0 ? "Move up: " : "Move down: ") + label,
          text,
          onclick: () => moveItem(q, list, li, dir),
        });
      const li = h(
        "li",
        { class: "qm-order-item", "data-item": i },
        h("span", { class: "qm-order-grip", "aria-hidden": "true", text: "⠿" }),
        h("span", { class: "qm-order-body", html: q.items[i] }),
        h("span", { class: "qm-order-btns" }, move(-1, "▲ Up"), move(1, "▼ Down")),
      );
      return li;
    }

    function syncOrder(list) {
      if (list._keep) list._keep.hidden = !!list.dataset.touched;
      for (const li of list.children) {
        li.querySelector("[data-dir='-1']").disabled = !li.previousElementSibling;
        li.querySelector("[data-dir='1']").disabled = !li.nextElementSibling;
      }
    }

    // Shared by the buttons and by dragging: mark the list touched, announce the new position, report the change.
    function afterMove(q, list, li) {
      list.dataset.touched = "1";
      syncOrder(list);
      liveEl.textContent =
        "Moved to position " + (Array.from(list.children).indexOf(li) + 1) + " of " + list.children.length;
      onChange(q);
    }

    function moveItem(q, list, li, dir) {
      const other = dir < 0 ? li.previousElementSibling : li.nextElementSibling;
      if (!other) return;
      if (dir < 0) list.insertBefore(li, other);
      else list.insertBefore(other, li);
      const btn = li.querySelector("[data-dir='" + dir + "']");
      (btn.disabled ? li.querySelector("[data-dir='" + -dir + "']") : btn).focus();
      afterMove(q, list, li);
    }

    // One guard for dragging: not once the card is locked (submitted or checked) or the buttons are disabled.
    function canDrag(list) {
      if (list.closest(".locked")) return false;
      return !!list.querySelector(".qm-move:not(:disabled)");
    }

    // Pointer-based drag to reorder (mouse, touch and pen). The buttons stay the accessible path.
    // Capture is set on the list, not the row, because moving a row in the DOM would drop its capture.
    // The row follows the pointer with a translateY; the other rows swap when the pointer crosses their midpoint.
    function enableDrag(q, list) {
      let drag = null;
      const EDGE = 40;
      const place = () => {
        const { li } = drag;
        const y = drag.y;
        for (let prev = li.previousElementSibling; prev; prev = li.previousElementSibling) {
          const r = prev.getBoundingClientRect();
          if (y >= r.top + r.height / 2) break;
          list.insertBefore(li, prev);
        }
        for (let next = li.nextElementSibling; next; next = li.nextElementSibling) {
          const r = next.getBoundingClientRect();
          if (y <= r.top + r.height / 2) break;
          list.insertBefore(next, li);
        }
        // keep the row under the pointer: pointer travel in the document minus the layout shift of the row
        const travel = y + window.scrollY - drag.docY;
        li.style.transform = "translateY(" + (travel - (li.offsetTop - drag.top)) + "px)";
      };
      const tick = () => {
        if (!drag || !drag.started) return;
        const vh = window.innerHeight;
        const step = drag.y < EDGE ? -8 : drag.y > vh - EDGE ? 8 : 0;
        if (step) {
          const before = window.scrollY;
          window.scrollBy(0, step);
          if (window.scrollY !== before) place();
        }
        drag.raf = requestAnimationFrame(tick);
      };
      list.addEventListener("pointerdown", (e) => {
        if (drag || (e.pointerType === "mouse" && e.button !== 0)) return;
        const li = e.target.closest && e.target.closest(".qm-order-item");
        if (!li || li.parentNode !== list || !canDrag(list)) return;
        if (!e.target.closest(".qm-order-grip")) {
          if (e.target.closest("button, a, input, select, textarea")) return;
          const sel = window.getSelection();
          if (sel && !sel.isCollapsed && sel.toString() && li.contains(sel.anchorNode)) return;
        }
        drag = {
          li,
          id: e.pointerId,
          y: e.clientY,
          startY: e.clientY,
          docY: e.clientY + window.scrollY,
          top: li.offsetTop,
          started: false,
          from: Array.from(list.children),
        };
      });
      list.addEventListener("pointermove", (e) => {
        if (!drag || e.pointerId !== drag.id) return;
        drag.y = e.clientY;
        if (!drag.started) {
          if (Math.abs(e.clientY - drag.startY) < 4) return;
          drag.started = true;
          try {
            list.setPointerCapture(e.pointerId);
          } catch (_) {}
          window.getSelection()?.removeAllRanges();
          drag.li.classList.add("qm-dragging");
          list.classList.add("qm-drag-active");
          drag.raf = requestAnimationFrame(tick);
        }
        e.preventDefault();
        place();
      });
      const end = (e, cancel) => {
        if (!drag || e.pointerId !== drag.id) return;
        const d = drag;
        drag = null;
        if (!d.started) return;
        cancelAnimationFrame(d.raf);
        try {
          list.releasePointerCapture(e.pointerId);
        } catch (_) {}
        d.li.classList.remove("qm-dragging");
        d.li.style.transform = "";
        list.classList.remove("qm-drag-active");
        if (cancel) d.from.forEach((li) => list.append(li));
        const same = Array.from(list.children).every((li, i) => li === d.from[i]);
        if (cancel || same) {
          syncOrder(list);
          return;
        }
        afterMove(q, list, d.li);
      };
      list.addEventListener("pointerup", (e) => end(e, false));
      list.addEventListener("pointercancel", (e) => end(e, true));
    }

    function choiceRow(_q, type, name, value, html) {
      const input = h("input", { type, name, value: String(value) });
      return h("label", { class: "qm-choice" }, input, h("span", { class: "qm-choice-body", html }));
    }

    // The text field under a choice that asked for details ("Something else" -> "What is it?").
    // Shown while its choice is selected. The text stays in the field when the row is hidden.
    function followupRow(q, host, choiceInput, i, prompt) {
      const id = "fu-" + q.id + "-" + i;
      const field = h("input", {
        type: "text",
        class: "qm-input qm-followup-input",
        id,
        "data-followup": String(i),
        autocomplete: "off",
      });
      const row = h(
        "div",
        { class: "qm-followup", id: id + "-row", hidden: true },
        h("label", { for: id, text: prompt }),
        field,
      );
      row._choice = choiceInput;
      choiceInput.setAttribute("aria-controls", row.id);
      // ARIA allows aria-expanded on a checkbox but not on a radio; radios rely on aria-controls
      // and on the field being the next stop in the tab order.
      const expandable = choiceInput.type === "checkbox";
      if (expandable) choiceInput.setAttribute("aria-expanded", "false");
      choiceInput.addEventListener("change", () => {
        if (!choiceInput.checked) return;
        row.hidden = false;
        if (expandable) choiceInput.setAttribute("aria-expanded", "true");
        if (host._arrow) liveEl.textContent = "Text field shown: " + prompt;
        else field.focus();
      });
      return row;
    }

    function syncFollowups(card) {
      card.querySelectorAll(".qm-followup").forEach((row) => {
        row.hidden = !row._choice.checked;
        if (row._choice.type === "checkbox") row._choice.setAttribute("aria-expanded", String(row._choice.checked));
      });
    }

    // Follow-up text by original choice index; only the selected choices unless `all`.
    function followupTexts(card, all) {
      const out = {};
      card.querySelectorAll(".qm-followup-input").forEach((f) => {
        const text = f.value.trim();
        if (text && (all || f.closest(".qm-followup")._choice.checked)) out[f.dataset.followup] = text;
      });
      return out;
    }

    function buildAnswer(q, _card, host) {
      const t = q.type;
      if (t === "single" || t === "multi") {
        let idxs = q.choices.map((_, i) => i);
        if (q.shuffle) idxs = shuffled(idxs, state.seed ^ hashString(q.id));
        const kind = t === "single" ? "radio" : "checkbox";
        host.setAttribute("role", t === "single" ? "radiogroup" : "group");
        // Arrow keys only move a radio selection; they must not drag focus into a follow-up field.
        host.addEventListener("keydown", (e) => (host._arrow = e.key.startsWith("Arrow")));
        host.addEventListener("keyup", () => (host._arrow = false));
        for (const i of idxs) {
          const row = choiceRow(q, kind, "c-" + q.id, i, q.choices[i]);
          host.append(row);
          const prompt = q.followups && q.followups[String(i)];
          if (prompt !== undefined) host.append(followupRow(q, host, row.querySelector("input"), i, prompt));
        }
        if (t === "multi") host.prepend(h("p", { class: "qm-tabhint", text: "Select all that apply." }));
      } else if (t === "truefalse") {
        const g = h("div", { class: "qm-tf", role: "radiogroup" });
        g.append(
          choiceRow(q, "radio", "c-" + q.id, "true", "True"),
          choiceRow(q, "radio", "c-" + q.id, "false", "False"),
        );
        host.append(g);
      } else if (t === "numeric") {
        const id = "n-" + q.id;
        host.append(
          h("label", { class: "qm-sr-only", for: id, text: "Your answer" }),
          h("input", {
            class: "qm-input",
            id,
            type: "text",
            inputmode: "decimal",
            autocomplete: "off",
            placeholder: "Your answer",
          }),
          q.unit ? h("span", { class: "qm-unit", text: q.unit }) : "",
          h("p", {
            class: "qm-numeric-hint",
            hidden: true,
            text: "Use a dot as the decimal separator (for example 3.14).",
          }),
        );
      } else if (t === "short") {
        const id = "s-" + q.id;
        host.append(
          h("label", { class: "qm-sr-only", for: id, text: "Your answer" }),
          h("input", {
            class: "qm-input",
            id,
            type: "text",
            autocomplete: "off",
            autocapitalize: "off",
            spellcheck: "false",
            placeholder: "Your answer",
          }),
        );
      } else if (t === "fields") {
        q.fields.forEach((f, i) => {
          const id = "f-" + q.id + "-" + i;
          host.append(
            h(
              "div",
              { class: "qm-field" },
              h("label", { for: id, html: f.label_html }),
              h("input", {
                class: "qm-input",
                id,
                type: "text",
                "data-field": i,
                autocomplete: "off",
                autocapitalize: "off",
                spellcheck: "false",
              }),
            ),
          );
        });
      } else if (t === "ordering") {
        const list = h("ol", { class: "qm-order" });
        if (q.ungraded) {
          // a ranking: shown in the written order; the learner moves items, or keeps the order
          host.append(
            h("p", {
              class: "qm-tabhint",
              text: "Rank the items, first choice at the top: drag them, or use the Up and Down buttons.",
            }),
            list,
          );
          q.items.forEach((_, i) => list.append(orderRow(q, list, i)));
          list._keep = h("button", {
            class: "qm-btn qm-btn-small qm-keep-order",
            type: "button",
            text: "Keep this order",
            onclick: () => {
              list.dataset.touched = "1";
              syncOrder(list);
              liveEl.textContent = "Order kept";
              onChange(q);
            },
          });
          host.append(list._keep);
        } else {
          host.append(
            h("p", {
              class: "qm-tabhint",
              text: "Put the items in order: drag them, or use the Move up and Move down buttons.",
            }),
            list,
          );
          orderIndexes(q).forEach((i) => list.append(orderRow(q, list, i)));
        }
        syncOrder(list);
        enableDrag(q, list);
      } else if (t === "matching") {
        const rights = orderIndexes(q, q.rights.length, "r");
        q.lefts.forEach((left, i) => {
          const id = "m-" + q.id + "-" + i;
          const sel = h("select", { class: "qm-input qm-select", id, "data-pair": i });
          sel.append(h("option", { value: "", text: "Choose..." }));
          for (const j of rights) sel.append(h("option", { value: String(j), text: htmlText(q.rights[j]) }));
          host.append(h("div", { class: "qm-field qm-match-row" }, h("label", { for: id, html: left }), sel));
        });
      } else if (t === "scale") {
        const sc = q.scale;
        const g = h("div", { class: "qm-scale", role: "radiogroup", "aria-labelledby": "t-" + q.id });
        g.style.gridTemplateColumns = "repeat(" + (sc.max - sc.min + 1) + ", minmax(0, 1fr))";
        for (let v = sc.min; v <= sc.max; v++) {
          const lab = sc.labels[String(v)];
          g.append(
            h(
              "label",
              { class: "qm-scale-opt" },
              h("input", { type: "radio", name: "c-" + q.id, value: String(v) }),
              h("span", { class: "qm-scale-num", text: v }),
              h("span", { class: "qm-scale-label", text: lab || "" }),
            ),
          );
        }
        host.append(g);
      } else if (t === "essay") {
        const ta = h("textarea", {
          class: "qm-textarea",
          "aria-label": q.ungraded ? "Your answer" : "Your essay",
          spellcheck: "true",
        });
        const counter = h("div", { class: "qm-counter", "aria-live": "off" });
        host.append(ta, counter);
        const upd = () => {
          const n = wordCount(ta.value);
          let msg = n + (n === 1 ? " word" : " words");
          counter.className = "qm-counter";
          if (q.min_words) msg += " (minimum " + q.min_words + ")";
          if (q.max_words) msg += (q.min_words ? ", maximum " : " (maximum ") + q.max_words + (q.min_words ? "" : ")");
          if (n < q.min_words) {
            counter.classList.add("low");
            msg += " - below the minimum";
          }
          if (q.max_words && n > q.max_words) {
            counter.classList.add("high");
            msg += " - over the maximum";
          }
          counter.textContent = msg;
        };
        ta.addEventListener("input", upd);
        ta._update = upd;
        upd();
      } else if (t === "code") {
        const ta = h("textarea", {
          class: "qm-textarea qm-code-input",
          "aria-label": "Your " + q.language + " code",
          spellcheck: "false",
          autocapitalize: "off",
        });
        ta.value = q.starter || "";
        ta.addEventListener("keydown", (e) => codeKeys(e, ta));
        host.append(
          ta,
          h("p", {
            class: "qm-tabhint",
            text: "Tab indents. Press Esc, then Tab, to move to the next control.",
          }),
        );
      }
    }

    function codeKeys(e, ta) {
      if (e.key === "Escape") {
        ta._escaped = true;
        return;
      }
      if (e.key !== "Tab") {
        ta._escaped = false;
        return;
      }
      if (ta._escaped) {
        ta._escaped = false;
        return;
      }
      e.preventDefault();
      const v = ta.value;
      const s = ta.selectionStart;
      const en = ta.selectionEnd;
      const insert = (text) => {
        // execCommand keeps the browser undo stack working; fall back to setRangeText
        if (!document.execCommand || !document.execCommand("insertText", false, text)) {
          ta.setRangeText(text, ta.selectionStart, ta.selectionEnd, "end");
          ta.dispatchEvent(new Event("input", { bubbles: true }));
        }
      };
      if (!e.shiftKey && s === en) {
        insert("    ");
        return;
      }
      // work on whole lines: from the start of the first selected line to the end of the last one
      const lineStart = v.lastIndexOf("\n", s - 1) + 1;
      const lastCharIdx = en > s && v[en - 1] === "\n" ? en - 1 : en; // a selection ending at a line start excludes that line
      let lineEnd = v.indexOf("\n", lastCharIdx);
      if (lineEnd === -1) lineEnd = v.length;
      const block = v.slice(lineStart, lineEnd);
      const lines = block.split("\n");
      const out = lines.map((ln) => (e.shiftKey ? ln.replace(/^( {1,4}|\t)/, "") : "    " + ln));
      ta.setSelectionRange(lineStart, lineEnd);
      insert(out.join("\n"));
      const firstDelta = out[0].length - lines[0].length;
      const totalDelta = out.join("\n").length - block.length;
      ta.setSelectionRange(Math.max(lineStart, s + firstDelta), Math.max(lineStart, en + totalDelta));
    }

    // ---------- reading and restoring answers ----------
    function inputsOf(card) {
      return Array.from(
        card.querySelectorAll("input:not([type=checkbox][aria-label^='Flag']), textarea, select, button.qm-move"),
      ).filter((el) => !el.closest(".qm-flag"));
    }

    function addInputs(r, texts) {
      if (Object.keys(texts).length) r.inputs = texts;
    }

    function readResponse(q, card) {
      let r = null;
      switch (q.type) {
        case "single": {
          const c = card.querySelector("input[name='c-" + q.id + "']:checked");
          r = c ? { choice: Number(c.value) } : null;
          if (r && q.followups) addInputs(r, followupTexts(card, false));
          break;
        }
        case "multi":
          r = {
            choices: Array.from(card.querySelectorAll("input[name='c-" + q.id + "']:checked"))
              .map((c) => Number(c.value))
              .sort((a, b) => a - b),
          };
          if (!r.choices.length) r = null;
          else if (q.followups) addInputs(r, followupTexts(card, false));
          break;
        case "truefalse": {
          const c = card.querySelector("input[name='c-" + q.id + "']:checked");
          r = c ? { value: c.value === "true" } : null;
          break;
        }
        case "scale": {
          const c = card.querySelector("input[name='c-" + q.id + "']:checked");
          r = c ? { value: Number(c.value) } : null;
          break;
        }
        case "numeric": {
          const v = card.querySelector(".qm-input").value;
          r = v.trim() ? { raw: v.trim() } : null;
          break;
        }
        case "short": {
          const v = card.querySelector(".qm-input").value;
          r = v.trim() ? { text: v.trim() } : null;
          break;
        }
        case "blanks": {
          const vals = [];
          card.querySelectorAll(".qm-blank").forEach((el) => (vals[Number(el.dataset.blank)] = el.value.trim()));
          for (let i = 0; i < q.n_blanks; i++) vals[i] = vals[i] || "";
          r = vals.some(Boolean) ? { blanks: vals } : null;
          break;
        }
        case "fields": {
          const vals = Array.from(card.querySelectorAll("[data-field]")).map((el) => el.value.trim());
          r = vals.some(Boolean) ? { fields: vals } : null;
          break;
        }
        case "ordering": {
          const list = card.querySelector(".qm-order");
          r = list.dataset.touched ? { order: Array.from(list.children).map((li) => Number(li.dataset.item)) } : null;
          break;
        }
        case "matching": {
          const pairs = Array.from(card.querySelectorAll("[data-pair]")).map((s) =>
            s.value === "" ? null : Number(s.value),
          );
          r = pairs.some((p) => p !== null) ? { pairs } : null;
          break;
        }
        case "essay": {
          const v = card.querySelector("textarea").value;
          r = v.trim() ? { text: v, word_count: wordCount(v) } : null;
          break;
        }
        case "code": {
          const v = card.querySelector("textarea").value;
          r = v.trim() && v.trim() !== (q.starter || "").trim() ? { language: q.language, code: v } : null;
          break;
        }
      }
      return r;
    }

    function restoreCard(q) {
      const card = cards[q.id];
      const r = state.answers[q.id];
      if (state.flags[q.id] && !REVIEW) card.querySelector(".qm-flag input").checked = true;
      if (q.followups) {
        // text typed under a choice that is now unselected is kept in state.drafts
        const saved = Object.assign({}, state.drafts[q.id], r && r.inputs);
        card.querySelectorAll(".qm-followup-input").forEach((f) => (f.value = saved[f.dataset.followup] || ""));
      }
      if (!r) return;
      switch (q.type) {
        case "single":
        case "truefalse": {
          const want = q.type === "single" ? String(r.choice) : String(r.value);
          card.querySelectorAll("input[name='c-" + q.id + "']").forEach((c) => (c.checked = c.value === want));
          break;
        }
        case "multi":
          card
            .querySelectorAll("input[name='c-" + q.id + "']")
            .forEach((c) => (c.checked = r.choices.includes(Number(c.value))));
          break;
        case "scale":
          card
            .querySelectorAll("input[name='c-" + q.id + "']")
            .forEach((c) => (c.checked = c.value === String(r.value)));
          break;
        case "numeric":
          card.querySelector(".qm-input").value = r.raw;
          break;
        case "short":
          card.querySelector(".qm-input").value = r.text;
          break;
        case "blanks":
          card.querySelectorAll(".qm-blank").forEach((el) => {
            el.value = r.blanks[Number(el.dataset.blank)] || "";
            if (!HAS_FIELD_SIZING) sizeBlank(el);
          });
          break;
        case "fields":
          card.querySelectorAll("[data-field]").forEach((el) => (el.value = r.fields[Number(el.dataset.field)] || ""));
          break;
        case "ordering": {
          const list = card.querySelector(".qm-order");
          const byItem = Object.fromEntries(Array.from(list.children).map((li) => [li.dataset.item, li]));
          r.order.forEach((i) => list.append(byItem[i]));
          list.dataset.touched = "1";
          syncOrder(list);
          break;
        }
        case "matching":
          card.querySelectorAll("[data-pair]").forEach((s) => {
            const p = r.pairs[Number(s.dataset.pair)];
            s.value = p === null || p === undefined ? "" : String(p);
          });
          break;
        case "essay": {
          const ta = card.querySelector("textarea");
          ta.value = r.text;
          ta._update();
          break;
        }
        case "code":
          card.querySelector("textarea").value = r.code;
          break;
      }
      syncChoiceHighlight(card);
    }

    function syncChoiceHighlight(card) {
      syncFollowups(card);
      card
        .querySelectorAll(".qm-choice")
        .forEach((row) => row.classList.toggle("sel", row.querySelector("input").checked));
    }

    function onChange(q) {
      if (state.submitted || state.checked[q.id]) return;
      const card = cards[q.id];
      syncChoiceHighlight(card);
      if (q.type === "numeric") {
        const v = card.querySelector(".qm-input").value.trim();
        card.querySelector(".qm-numeric-hint").hidden = !/^[+-]?\d*,\d+$/.test(v);
      }
      const r = readResponse(q, card);
      if (q.followups) state.drafts[q.id] = followupTexts(card, true);
      const now = Date.now();
      if (r) state.answers[q.id] = r;
      else delete state.answers[q.id];
      if (r && !state.firstAnswered[q.id]) state.firstAnswered[q.id] = now;
      state.lastChanged[q.id] = now;
      state.changes[q.id] = (state.changes[q.id] || 0) + 1;
      refreshPill(q);
      refreshProgress();
      save();
    }

    // Pill state in words (for the aria-label) and as a corner symbol (decoration only).
    const PILL_WORDS = {
      correct: "correct",
      incorrect: "wrong",
      partial: "partly correct",
      pending: "waiting for AI grading",
      unanswered: "not answered",
      ungraded: "answered",
    };
    const PILL_SYMBOLS = { correct: "✓", incorrect: "✗", partial: "½", pending: "?", unanswered: "–" };

    function setPillStatus(q, status) {
      const p = pills[q.id];
      if (!p) return;
      p.classList.remove(...ST_CLASSES);
      p.classList.add("st-" + status);
      p.dataset.status = status;
      if (PILL_SYMBOLS[status]) p.dataset.sym = PILL_SYMBOLS[status];
      else delete p.dataset.sym;
      refreshPill(q);
    }

    function refreshPill(q) {
      const p = pills[q.id];
      if (!p) return;
      p.classList.toggle("answered", !!state.answers[q.id]);
      p.classList.toggle("flagged", !!state.flags[q.id]);
      const words = [];
      if (p.dataset.status) words.push(PILL_WORDS[p.dataset.status]);
      else if (state.answers[q.id]) words.push("answered");
      if (state.flags[q.id]) words.push("flagged");
      p.setAttribute("aria-label", p.dataset.label + (words.length ? ", " + words.join(", ") : ""));
    }

    function setProgress(n, total, word) {
      progressEl.textContent = word + " " + n + "/" + total;
      const pct = total ? Math.round((100 * n) / total) : 0;
      pctEl.textContent = pct + "%";
      barEl.setAttribute("aria-valuemin", "0");
      barEl.setAttribute("aria-valuemax", String(total));
      barEl.setAttribute("aria-valuenow", String(n));
      barEl.firstChild.style.width = pct + "%";
    }

    function refreshProgress() {
      if (REVIEW) {
        setProgress(Q.filter((q) => reviewLead(q) && state.answers[q.id]).length, cardCount(), "Reviewed");
        return;
      }
      setProgress(Q.filter((q) => state.answers[q.id]).length, Q.length, "Answered");
    }

    // The key under the pill grid: only the states this page can show.
    function refreshLegend() {
      const items = [["", "Not answered yet"]];
      items.push(["answered", "Answered"]);
      if ((state.submitted || DATA.feedback === "instant") && !SURVEY) {
        items.push(
          ["st-correct", "Correct"],
          ["st-incorrect", "Wrong"],
          ["st-partial", "Partly correct"],
          ["st-pending", "Waiting for AI grading"],
        );
      }
      if (!REVIEW) items.push(["flagged", "Flagged for review"]);
      legendEl.replaceChildren(
        ...items.map(([cls, text]) => {
          const status = cls.startsWith("st-") ? cls.slice(3) : "";
          return h(
            "li",
            null,
            h("span", {
              class: "qm-sw " + cls,
              "aria-hidden": "true",
              "data-sym": PILL_SYMBOLS[status] || false,
            }),
            text,
          );
        }),
      );
    }

    function refreshAll() {
      Q.forEach(refreshPill);
      refreshProgress();
      refreshLegend();
      submitBtn.hidden = state.submitted;
    }

    // ---------- feedback ----------
    function specOf(q) {
      return KEY ? KEY[q.id].spec : null;
    }

    function plainCorrect(q, spec) {
      const strip = (html) => {
        const d = document.createElement("div");
        d.innerHTML = html;
        return d.textContent.trim();
      };
      switch (q.type) {
        case "truefalse":
          return spec.value ? "True" : "False";
        case "numeric": {
          const tol = spec.rel_tolerance
            ? " (within " + spec.rel_tolerance * 100 + "%)"
            : spec.tolerance
              ? " (within " + spec.tolerance + ")"
              : "";
          return spec.values.join(" or ") + tol + (spec.unit ? " " + spec.unit : "");
        }
        case "short":
          return spec.accept.concat(spec.patterns.map((p) => "/" + p + "/")).join("  |  ");
        case "blanks":
          return spec.blanks
            .map(
              (b, i) =>
                i + 1 + ". " + (b.numeric ? b.value + (b.tolerance ? " ±" + b.tolerance : "") : b.accept.join(" / ")),
            )
            .join("   ");
        case "ordering":
          return q.items.map(strip).join("  →  ");
        case "matching":
          return spec.answer.map((a, i) => strip(q.lefts[i]) + " → " + strip(q.rights[a])).join("   ;   ");
        case "fields":
          return spec.fields
            .map((f) =>
              f.kind === "none"
                ? null
                : strip(q.fields[spec.fields.indexOf(f)].label_html) +
                  " " +
                  (f.kind === "numeric"
                    ? f.values.join(" or ")
                    : f.accept.concat(f.patterns.map((p) => "/" + p + "/")).join(" / ")),
            )
            .filter(Boolean)
            .join("   ;   ");
        default:
          return "";
      }
    }

    const STATUS_TEXT = {
      ungraded: "Answered",
      correct: "Correct",
      incorrect: "Incorrect",
      partial: "Partially correct",
      unanswered: "Not answered",
      pending: "Pending review",
    };

    const ST_CLASSES = ["st-correct", "st-partial", "st-incorrect", "st-pending", "st-unanswered", "st-ungraded"];

    // "Something else: a hackathon" when the choice has follow-up text, else just the choice.
    function choiceAnswerText(q, resp, i) {
      const extra = resp.inputs && resp.inputs[String(i)];
      return htmlText(q.choices[i]) + (extra ? ": " + extra : "");
    }

    // The answer as plain lines of text, for the "Your answer" block of an ungraded question.
    function describeAnswer(q, resp) {
      if (!resp) return [];
      switch (q.type) {
        case "single":
          return [choiceAnswerText(q, resp, resp.choice)];
        case "multi":
          return resp.choices.map((i) => choiceAnswerText(q, resp, i));
        case "short":
        case "essay":
          return [resp.text];
        case "fields":
          return q.fields.map((f, i) => htmlText(f.label_html) + ": " + (resp.fields[i] || "-"));
        case "ordering":
          return resp.order.map((item) => htmlText(q.items[item]));
        case "scale": {
          const lab = q.scale.labels[String(resp.value)];
          return [resp.value + " / " + q.scale.max + (lab ? " (" + lab + ")" : "")];
        }
        default:
          return [];
      }
    }

    // Ungraded: no badge, no right or wrong. Show the answer and, if there is one, why it is asked.
    function showAnswerOnly(q, g) {
      const card = cards[q.id];
      const host = card.querySelector(".qm-feedback-host");
      const k = KEY ? KEY[q.id] : {};
      card.classList.add("locked");
      card.classList.remove(...ST_CLASSES);
      card.classList.add("st-" + g.status);
      inputsOf(card).forEach((el) => (el.disabled = true));
      card.querySelectorAll(".qm-keep-order").forEach((el) => (el.disabled = true));
      const lines = describeAnswer(q, state.answers[q.id]);
      const fb = h("div", { class: "qm-feedback qm-your-answer" });
      fb.append(h("div", { class: "qm-badge-plain", text: "Your answer" }));
      if (!lines.length) fb.append(h("p", { class: "qm-no-answer", text: "Not answered" }));
      else if (q.type === "ordering")
        fb.append(
          h(
            "ol",
            { class: "qm-answer-list" },
            lines.map((ln) => h("li", { text: ln })),
          ),
        );
      else if (q.type === "fields" || q.type === "multi")
        fb.append(
          h(
            "ul",
            { class: "qm-answer-list" },
            lines.map((ln) => h("li", { text: ln })),
          ),
        );
      else fb.append(h("p", { class: "qm-answer-text", text: lines[0] }));
      if (k.explanation_html)
        fb.append(
          h(
            "div",
            { class: "qm-explain" },
            h("h4", { class: "qm-why", text: "Why this is asked" }),
            h("div", { html: k.explanation_html }),
          ),
        );
      if (k.sample_html)
        fb.append(
          h("div", { class: "qm-reveal" }, h("h4", { text: "Sample answer" }), h("div", { html: k.sample_html })),
        );
      host.replaceChildren(fb);
      typeset(host);
      setPillStatus(q, g.status);
    }

    function showFeedback(q, g) {
      if (q.ungraded) return showAnswerOnly(q, g);
      const card = cards[q.id];
      const host = card.querySelector(".qm-feedback-host");
      const spec = specOf(q);
      const k = KEY ? KEY[q.id] : {};
      card.classList.add("locked");
      card.classList.remove(...ST_CLASSES);
      card.classList.add("st-" + g.status);
      inputsOf(card).forEach((el) => (el.disabled = true));
      const chk = card.querySelector(".qm-check");
      if (chk) chk.disabled = true;

      // mark choices and inputs
      if (spec && (q.type === "single" || q.type === "multi" || q.type === "truefalse")) {
        const resp = state.answers[q.id];
        const correctSet =
          q.type === "single" ? [spec.correct] : q.type === "multi" ? spec.correct : [spec.value ? "true" : "false"];
        const chosen = !resp
          ? []
          : q.type === "single"
            ? [resp.choice]
            : q.type === "multi"
              ? resp.choices
              : [String(resp.value)];
        card.querySelectorAll(".qm-choice").forEach((row) => {
          const v = row.querySelector("input").value;
          const isCorrect = correctSet.map(String).includes(v);
          const isChosen = chosen.map(String).includes(v);
          row.classList.toggle("ok", isCorrect);
          row.classList.toggle("bad", isChosen && !isCorrect);
          row.querySelector(".qm-mark")?.remove();
          if (isCorrect || (isChosen && !isCorrect))
            row.append(h("span", { class: "qm-mark", "aria-hidden": "true", text: isCorrect ? "✓" : "✗" }));
        });
      }
      if (g.results && (q.type === "blanks" || q.type === "fields")) {
        const sel = q.type === "blanks" ? ".qm-blank" : "[data-field]";
        card.querySelectorAll(sel).forEach((el) => {
          const i = Number(q.type === "blanks" ? el.dataset.blank : el.dataset.field);
          el.classList.remove("is-ok", "is-bad");
          if (g.results[i] === true) el.classList.add("is-ok");
          else if (g.results[i] === false) el.classList.add("is-bad");
        });
      }
      if (g.results && q.type === "matching") {
        card.querySelectorAll("[data-pair]").forEach((el) => {
          const ok = g.results[Number(el.dataset.pair)];
          el.classList.toggle("is-ok", ok);
          el.classList.toggle("is-bad", !ok);
          el.parentElement.querySelector(".qm-mark")?.remove();
          el.after(h("span", { class: "qm-mark", "aria-hidden": "true", text: ok ? " ✓" : " ✗" }));
        });
      }
      if (g.results && q.type === "ordering") {
        Array.from(card.querySelectorAll(".qm-order > li")).forEach((li, pos) => {
          const ok = g.results[pos];
          li.classList.toggle("ok", ok);
          li.classList.toggle("bad", !ok);
          li.querySelector(".qm-mark")?.remove();
          li.append(h("span", { class: "qm-mark", "aria-hidden": "true", text: ok ? "✓" : "✗" }));
        });
      }
      if (q.type === "numeric")
        card.querySelector(".qm-input").classList.add(g.status === "correct" ? "is-ok" : "is-bad");
      if (q.type === "short")
        card.querySelector(".qm-input").classList.add(g.status === "correct" ? "is-ok" : "is-bad");

      let badge = STATUS_TEXT[g.status];
      if (AUTO.includes(q.type) && g.status !== "unanswered")
        badge += " - " + pts(g.earned) + "/" + pts(q.points) + " pts";
      if (g.status === "pending" || ((q.type === "essay" || q.type === "code") && g.status === "unanswered"))
        badge += " (" + pts(q.points) + " pts)";
      const fb = h("div", { class: "qm-feedback" }, h("div", { class: "qm-badge", text: badge }));
      if (spec && AUTO.includes(q.type) && q.type !== "single" && q.type !== "multi") {
        const ans = plainCorrect(q, spec);
        // a correct answer is shown only in "Print with answers"
        if (ans)
          fb.append(
            h(
              "p",
              { class: "qm-correct-answer" + (g.status === "correct" ? " qm-key-only" : "") },
              h("strong", { text: "Correct answer: " }),
              ans,
            ),
          );
      }
      if (k.explanation_html) fb.append(h("div", { class: "qm-explain", html: k.explanation_html }));
      if (k.sample_html)
        fb.append(
          h("div", { class: "qm-reveal" }, h("h4", { text: "Sample answer" }), h("div", { html: k.sample_html })),
        );
      if (k.reference_html)
        fb.append(
          h(
            "div",
            { class: "qm-reveal" },
            h("h4", { text: "Reference solution" }),
            h("div", { html: k.reference_html }),
          ),
        );
      host.replaceChildren(fb);
      typeset(host);
      setPillStatus(q, g.status);
    }

    function checkQuestion(q) {
      if (!KEY || state.submitted || state.checked[q.id]) return;
      const r = readResponse(q, cards[q.id]);
      if (!r) {
        const host = cards[q.id].querySelector(".qm-feedback-host");
        host.replaceChildren(
          h(
            "div",
            { class: "qm-feedback st-unanswered" },
            h("div", { class: "qm-badge", text: "Answer the question first." }),
          ),
        );
        return;
      }
      state.checked[q.id] = true;
      save(true);
      showFeedback(q, gradeQuestion(q.type, specOf(q), state.answers[q.id] || null));
    }

    // ---------- timer ----------
    function elapsedSeconds() {
      const end = state.submitted ? state.submittedAt : Date.now();
      return Math.max(0, (end - state.startedAt) / 1000);
    }

    const announced = {};
    function tick() {
      if (state.submitted) {
        renderTimerFinal();
        return;
      }
      const el = elapsedSeconds();
      if (!limit) {
        timerEl.textContent = fmtClock(el);
        return;
      }
      const left = limit - el;
      timerEl.classList.toggle("warn5", left <= 300 && left > 60);
      timerEl.classList.toggle("warn1", left <= 60 && left > 0);
      timerEl.classList.toggle("over", left <= 0);
      if (left <= 300 && !announced[300] && limit > 300) {
        announced[300] = 1;
        liveEl.textContent = "5 minutes remaining";
      }
      if (left <= 60 && !announced[60] && limit > 60) {
        announced[60] = 1;
        liveEl.textContent = "1 minute remaining";
      }
      if (left > 0) {
        timerEl.textContent = fmtClock(left);
      } else if (DATA.on_timeout === "submit") {
        submit(true);
      } else {
        timerEl.textContent = "+" + fmtClock(-left);
      }
    }

    function renderTimerFinal() {
      timerEl.classList.remove("warn5", "warn1");
      timerEl.classList.toggle("over", state.timedOut);
      timerEl.textContent = (limit ? "Used " : "Time ") + fmtClock(elapsedSeconds());
    }

    function startTimer() {
      clearInterval(tickHandle);
      tick();
      if (!state.submitted) tickHandle = setInterval(tick, 500);
    }

    // ---------- submit ----------
    async function onSubmit() {
      const open = REVIEW
        ? Q.filter((q) => reviewLead(q) && !state.answers[q.id]).length
        : Q.filter((q) => !state.answers[q.id]).length;
      const verb = SURVEY ? "Finish" : "Submit";
      const noun = REVIEW ? "review card" : "unanswered question";
      const tail = REVIEW ? " without a verdict" : "";
      const msg = open
        ? "You have " + open + " " + noun + (open === 1 ? "" : "s") + tail + ". " + verb + " anyway?"
        : verb + " your answers? You cannot change them afterwards.";
      if (await confirmDialog(msg, verb)) submit(false);
    }

    function submit(timedOut) {
      if (state.submitted) return;
      // capture whatever is typed right now
      Q.forEach((q) => {
        if (!state.checked[q.id]) {
          const r = readResponse(q, cards[q.id]);
          if (r) state.answers[q.id] = r;
          else delete state.answers[q.id];
        }
      });
      state.submitted = true;
      state.timedOut = !!timedOut;
      state.submittedAt = timedOut && limit ? state.startedAt + limit * 1000 : Date.now();
      clearInterval(tickHandle);
      save(true);
      refreshAll();
      showResults();
      renderTimerFinal();
      resultsHost.scrollIntoView({ behavior: "smooth", block: "start" });
      sendResults();
    }

    // `quiz serve` injects window.FULLMARK_SUBMIT = {url, token}; from disk it is absent and
    // nothing is sent. Export answers stays available either way.
    async function sendResults() {
      const target = window.FULLMARK_SUBMIT;
      const box = resultsHost.querySelector(".qm-results");
      if (!target || !target.url || !box) return;
      const status = h("p", { class: "qm-sent", id: "send-status", role: "status", text: "Sending your answers…" });
      const anchor = box.querySelector(".qm-timeup") || box.firstChild;
      anchor.after(status);
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 15000);
      try {
        const res = await fetch(target.url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Fullmark-Token": target.token || "" },
          body: JSON.stringify(buildExport()),
          signal: ctl.signal,
        });
        if (!res.ok) throw new Error("HTTP " + res.status);
        status.textContent = "✓ Answers sent. You can close this tab.";
        status.classList.add("qm-sent-ok");
        box.querySelectorAll(".qm-export-hint").forEach((el) => el.remove());
      } catch {
        status.textContent = "✗ Could not send; use Export answers.";
        status.classList.add("qm-sent-fail");
      } finally {
        clearTimeout(timer);
      }
    }

    // ---------- grading the whole attempt ----------
    function gradeAll() {
      const per = {};
      let earned = 0;
      let possibleAuto = 0;
      let pending = 0;
      for (const q of Q) {
        const g = KEY
          ? gradeQuestion(q.type, specOf(q), state.answers[q.id] || null)
          : { earned: q.ungraded ? null : 0, status: "unanswered" };
        per[q.id] = g;
        if (q.ungraded) continue;
        if (AUTO.includes(q.type) && g.status !== "pending") {
          possibleAuto += q.points;
          earned += g.earned;
        } else {
          pending += q.points;
        }
      }
      earned = round2(earned);
      const pct = possibleAuto ? round2((earned / possibleAuto) * 100) : null;
      const passed =
        pct !== null && DATA.pass_mark !== null && DATA.pass_mark !== undefined ? pct >= DATA.pass_mark : null;
      return {
        per,
        score: {
          earned,
          possible_auto: possibleAuto,
          pending_points: pending,
          possible_total: totalPoints(),
          percent_auto: pct,
          passed,
        },
      };
    }

    function showResults() {
      const { per, score } = gradeAll();
      for (const q of Q) showFeedback(q, per[q.id]);
      inputsOf(wrap).forEach((el) => (el.disabled = true));
      wrap.querySelectorAll(".qm-check").forEach((b) => (b.disabled = true));

      const box = h("section", { class: "qm-results", id: "results", tabindex: "-1" }, h("h2", { text: "Results" }));
      if (state.timedOut)
        box.append(
          h("p", {
            class: "qm-timeup",
            text: "Time's up - your answers were submitted automatically.",
          }),
        );
      if (SURVEY) {
        const answered = Q.filter((q) => (!REVIEW || reviewLead(q)) && state.answers[q.id]).length;
        box.append(
          h("p", { class: "qm-survey-done", text: "Your answers are ready." }),
          h("p", {
            text: REVIEW
              ? "Reviewed " + answered + " of " + cardCount() + " cards."
              : "Answered " + answered + " of " + Q.length + " questions.",
          }),
          h("p", { class: "qm-export-hint", text: "Export your answers and send the file to whoever asked for them." }),
          h("p", { text: "Time used: " + fmtSpan(elapsedSeconds()) + "." }),
          h(
            "div",
            { class: "qm-actions qm-no-print" },
            h("button", {
              class: "qm-btn qm-btn-primary",
              id: "export-btn-2",
              type: "button",
              text: "Export answers",
              onclick: openExport,
            }),
            h("button", { class: "qm-btn", type: "button", text: "Print", onclick: () => window.print() }),
          ),
        );
        resultsHost.replaceChildren(box);
        return;
      }
      if (score.percent_auto !== null) {
        scoreEl.textContent =
          "Score " + pts(score.earned) + "/" + pts(score.possible_auto) + " pts · " + score.percent_auto + "%";
        scoreEl.hidden = false;
        const verdict =
          score.passed === null
            ? null
            : h("span", {
                class: "qm-verdict st-" + (score.passed ? "correct" : "incorrect"),
                text: score.passed ? "✓ Passed" : "✗ Not passed",
              });
        box.append(h("p", null, h("span", { class: "qm-score", text: score.percent_auto + "%" }), verdict));
        box.append(
          h("p", {
            text:
              pts(score.earned) +
              " of " +
              pts(score.possible_auto) +
              " auto-graded points" +
              (DATA.pass_mark !== null && DATA.pass_mark !== undefined ? " (pass mark " + DATA.pass_mark + "%)" : "") +
              ".",
          }),
        );
      } else {
        box.append(h("p", { text: "There are no auto-graded questions in this quiz." }));
      }
      if (score.pending_points)
        box.append(
          h("p", {
            text:
              pts(score.pending_points) +
              " points are waiting for review (essay and code answers). Export your answers and ask an AI to grade them.",
          }),
        );
      box.append(h("p", { text: "Time used: " + fmtSpan(elapsedSeconds()) + "." }));

      // filter: all questions, or only those that need another look
      const review = Q.filter((q) => !q.ungraded && ["incorrect", "partial", "unanswered"].includes(per[q.id].status));
      const retry = async () => {
        const msg = state.exported
          ? "Start a new attempt with only the " + review.length + " missed question(s)?"
          : "You have not exported this attempt. Starting the retry discards it. Continue?";
        if (!(await confirmDialog(msg, "Retry"))) return;
        window.scrollTo(0, 0);
        begin(review.map((q) => q.id));
      };
      if (review.length) {
        const setFilter = (only) => {
          for (const q of Q) {
            const hide = only && !review.includes(q);
            cards[q.id].hidden = hide;
            if (pills[q.id]) pills[q.id].hidden = hide;
          }
          allBtn.setAttribute("aria-pressed", String(!only));
          reviewBtn.setAttribute("aria-pressed", String(only));
          liveEl.textContent = only
            ? "Showing " + review.length + " question" + (review.length === 1 ? "" : "s") + " that need review"
            : "Showing all questions";
        };
        const allBtn = h("button", {
          class: "qm-btn",
          type: "button",
          "aria-pressed": "true",
          text: "All questions",
          onclick: () => setFilter(false),
        });
        const reviewBtn = h("button", {
          class: "qm-btn",
          type: "button",
          "aria-pressed": "false",
          text: "Needs review (" + review.length + ")",
          onclick: () => setFilter(true),
        });
        box.append(
          h(
            "div",
            { class: "qm-actions qm-filter qm-no-print", role: "group", "aria-label": "Show" },
            allBtn,
            reviewBtn,
          ),
        );
      }

      // per-tag breakdown
      const tags = {};
      for (const q of Q) {
        if (q.ungraded || !AUTO.includes(q.type) || per[q.id].status === "pending") continue;
        for (const t of q.tags) {
          tags[t] = tags[t] || { earned: 0, possible: 0 };
          tags[t].earned += per[q.id].earned;
          tags[t].possible += q.points;
        }
      }
      const tagNames = Object.keys(tags).sort();
      if (tagNames.length) {
        box.append(h("h3", { text: "By topic" }));
        const tb = h(
          "table",
          { class: "qm-table" },
          h(
            "thead",
            null,
            h("tr", null, h("th", { text: "Topic" }), h("th", { class: "num", text: "Points" }), h("th", { text: "" })),
          ),
        );
        const body = h("tbody");
        tagNames.forEach((t) => {
          const pct = tags[t].possible ? (tags[t].earned / tags[t].possible) * 100 : 0;
          body.append(
            h(
              "tr",
              null,
              h("td", { text: t }),
              h("td", {
                class: "num",
                text: pts(tags[t].earned) + "/" + pts(tags[t].possible) + " (" + Math.round(pct) + "%)",
              }),
              h("td", null, h("span", { class: "qm-bar" }, h("span", { style: "width:" + Math.round(pct) + "%" }))),
            ),
          );
        });
        tb.append(body);
        box.append(tb);
      }

      // per-question table
      box.append(h("h3", { text: "Questions" }));
      const qt = h(
        "table",
        { class: "qm-table" },
        h(
          "thead",
          null,
          h(
            "tr",
            null,
            h("th", { text: "#" }),
            h("th", { text: "Type" }),
            h("th", { text: "Status" }),
            h("th", { class: "num", text: "Points" }),
          ),
        ),
      );
      const qb = h("tbody");
      order.forEach((q, i) => {
        const g = per[q.id];
        const mark = {
          correct: "✓ ",
          incorrect: "✗ ",
          partial: "◐ ",
          pending: "⏳ ",
          unanswered: "– ",
          ungraded: "• ",
        }[g.status];
        qb.append(
          h(
            "tr",
            null,
            h("td", null, h("a", { href: "#card-" + q.id, text: String(i + 1) })),
            h("td", { text: q.type }),
            h("td", { text: mark + STATUS_TEXT[g.status] }),
            h("td", {
              class: "num",
              text: q.ungraded
                ? "not scored"
                : g.earned === null
                  ? "? / " + pts(q.points)
                  : pts(g.earned) + " / " + pts(q.points),
            }),
          ),
        );
      });
      qt.append(qb);
      box.append(qt);
      box.append(
        h(
          "div",
          { class: "qm-actions qm-no-print" },
          h("button", {
            class: "qm-btn qm-btn-primary",
            id: "export-btn-2",
            type: "button",
            text: "Export answers",
            onclick: openExport,
          }),
          h("button", {
            class: "qm-btn",
            type: "button",
            text: "Print",
            onclick: () => window.print(),
          }),
          h("button", {
            class: "qm-btn",
            type: "button",
            id: "retry-btn",
            text: "Retry missed (" + review.length + ")",
            disabled: review.length === 0,
            onclick: retry,
          }),
          h("button", {
            class: "qm-btn",
            type: "button",
            id: "print-key-btn",
            text: "Print with answers",
            onclick: printWithKey,
          }),
        ),
      );
      resultsHost.replaceChildren(box);
    }

    function printWithKey() {
      document.body.classList.add("qm-print-key");
      window.addEventListener("afterprint", () => document.body.classList.remove("qm-print-key"), { once: true });
      window.print();
    }

    // =================================================================
    // Export
    // =================================================================
    function correctShape(q, spec) {
      switch (q.type) {
        case "single":
          return { choice: spec.correct };
        case "multi":
          return { choices: spec.correct };
        case "truefalse":
          return { value: spec.value };
        case "numeric":
          return {
            value: spec.values[0],
            tolerance: spec.rel_tolerance ? null : spec.tolerance,
            rel_tolerance: spec.rel_tolerance,
            values: spec.values,
          };
        case "short":
          return { accept: spec.accept, patterns: spec.patterns };
        case "blanks":
          return {
            blanks: spec.blanks.map((b) => (b.numeric ? [String(b.value)] : b.accept)),
            specs: spec.blanks,
          };
        case "fields":
          return { fields: spec.fields };
        case "ordering":
          return { order: Array.from({ length: spec.n }, (_, i) => i) };
        case "matching":
          return { pairs: spec.answer };
        default:
          return null;
      }
    }

    function buildExport() {
      const { per, score } = gradeAll();
      const el = Math.round(elapsedSeconds());
      const questions = Q.map((q) => {
        const g = per[q.id];
        const resp = state.answers[q.id] || null;
        const response = resp ? JSON.parse(JSON.stringify(resp)) : null;
        if (response && q.type === "numeric") {
          const v = parseNumber(response.raw);
          response.value = v === null ? null : v;
        }
        const spec = specOf(q);
        const correct = spec && !q.ungraded ? correctShape(q, spec) : null;
        if (correct && g.results) correct.results = g.results;
        const sec = DATA.sections[q.section];
        return {
          id: q.id,
          index: q.index,
          section: sec.title || null,
          type: q.type,
          title: q.title_md,
          points: q.points,
          tags: q.tags,
          flagged: !!state.flags[q.id],
          status: g.status,
          earned: g.earned,
          response,
          correct,
          first_answered_at: state.firstAnswered[q.id] ? iso(state.firstAnswered[q.id]) : null,
          last_changed_at: state.lastChanged[q.id] ? iso(state.lastChanged[q.id]) : null,
          changes: state.changes[q.id] || 0,
        };
      });
      return {
        format: "fullmark-results",
        version: 1,
        quiz: {
          id: DATA.id,
          title: DATA.title,
          hash: DATA.hash,
          source_file: DATA.source_file,
          built_at: DATA.built_at,
          fullmark_version: DATA.fullmark_version,
        },
        attempt: {
          mode: SURVEY ? "survey" : "quiz",
          bank: bank || state.retryOf ? { seed: state.seed, pool: QALL.length, drawn: Q.map((q) => q.id) } : null,
          retry_of: state.retryOf,
          submitted: state.submitted,
          started_at: iso(state.startedAt),
          submitted_at: state.submitted ? iso(state.submittedAt) : null,
          elapsed_seconds: el,
          time_limit_seconds: limit || null,
          timed_out: state.timedOut,
          overtime_seconds: limit && DATA.on_timeout === "warn" ? Math.max(0, el - limit) : 0,
          user_agent: navigator.userAgent,
        },
        score,
        questions,
      };
    }

    function exportName() {
      const d = new Date();
      const p = (n) => String(n).padStart(2, "0");
      return (
        DATA.id +
        "-results-" +
        d.getFullYear() +
        p(d.getMonth() + 1) +
        p(d.getDate()) +
        "-" +
        p(d.getHours()) +
        p(d.getMinutes()) +
        ".json"
      );
    }

    function openExport() {
      if (!state.started) return;
      // pick up any text typed but not yet recorded
      if (!state.submitted)
        Q.forEach((q) => {
          if (!state.checked[q.id]) onChange(q);
        });
      const text = JSON.stringify(buildExport(), null, 2);
      const name = exportName();
      dialog((dlg, close) => {
        const ta = h("textarea", {
          readonly: true,
          "aria-label": "Results JSON",
          id: "export-json",
        });
        ta.value = text;
        const note = h("p", { class: "qm-tabhint", id: "export-note", text: "" });
        const link = h("a", {
          class: "qm-btn qm-btn-primary",
          id: "export-download",
          text: "Download " + name,
          download: name,
          href: "#",
          style: "text-decoration:none;display:inline-block",
        });
        link.addEventListener("click", () => {
          const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
          link.href = url;
          state.exported = true;
          save(true);
          setTimeout(() => URL.revokeObjectURL(url), 10000);
        });
        const copy = h("button", {
          class: "qm-btn",
          type: "button",
          id: "export-copy",
          text: "Copy JSON",
          onclick: async () => {
            try {
              await navigator.clipboard.writeText(text);
              note.textContent = "Copied to the clipboard.";
              state.exported = true;
              save(true);
            } catch {
              ta.focus();
              ta.select();
              note.textContent = "The clipboard is not available here. The text is selected: press Ctrl+C.";
            }
          },
        });
        dlg.append(
          h("h3", { text: "Export answers" }),
          h("p", {
            text: state.submitted
              ? "Download the file or copy the JSON, then give it to your AI reviewer."
              : "This attempt is not submitted yet; the export says so.",
          }),
          ta,
          note,
          h(
            "div",
            { class: "qm-actions" },
            copy,
            link,
            h("button", {
              class: "qm-btn",
              type: "button",
              id: "export-close",
              text: "Close",
              onclick: () => close(true),
            }),
          ),
        );
        setTimeout(() => {
          ta.focus();
          ta.select();
        }, 0);
      });
    }

    // public hooks (tests, console)
    window.fullmark = { gradeQuestion, buildExport, state: () => state, data: DATA, parseNumber };

    showStart();
  }

  window.fullmark = { gradeQuestion, parseNumber, round2 };
  if (document.getElementById("quiz-data")) main();
})();
