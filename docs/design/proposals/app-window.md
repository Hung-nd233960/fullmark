# Proposal: knowing when the quiz window closes, and an app window

**Status: proposal, not in v1 scope.** The seam it needs is the one-shot server ([TECHNICAL_DESIGN.md](../TECHNICAL_DESIGN.md), section 7, foundation 4), which can take new routes without changing anything else, and a served page that is built differently from a shared one (below).

## The idea

Today `serve`, `review`, `brief --web`, `grade --web` and `library take` open the page in the default browser and wait for one submit. If the learner closes the tab, the server cannot tell, and whoever is waiting (often an agent) waits out `--timeout`, 1800 s by default. Three steps, cheapest first:

1. **Know that the page closed**, in any browser.
2. **Open a dedicated window** instead of a browser tab, with the browser already installed.
3. **An escape hatch** for anyone who wants their own app shell.

## 1. Close detection

```text
quiz serve FILE --exit-on-close [--close-grace SECONDS]
```

- The served page sends a heartbeat to `POST /alive` every 10 s, and a `navigator.sendBeacon` on `pagehide`.
- When no heartbeat has arrived for the grace period (default 45 s), the server exits with `{"status": "closed"}` and exit `2`. With `--autosave`, the attempt in progress is in the file, so the next run resumes it.
- The grace period is long on purpose: a reload fires `pagehide` too, and browsers throttle timers in background tabs, so a short one reports closed tabs that are not.
- The route has the same checks as `/submit` (token, `Host`, `Origin`, body cap).
- Applies to every one-shot server command. Without `--exit-on-close` nothing changes.

## 2. An app window: `--open app`

`--open` gains a value: `--open app` starts the page in Chromium's app mode (`msedge --app=URL`, or Chrome or Chromium with the same flag), a window with no tabs and no address bar. Edge is on every Windows machine, so this adds no dependency. A temporary profile folder (`--user-data-dir`) makes it a process of its own.

- fullmark owns that process, so a closed window is known at once, without heartbeats.
- After a submit the page can try `window.close()`; when the browser refuses, fullmark ends the process it started. (Whether `window.close()` works in app mode needs testing on each browser.)
- No Chromium browser found: falls back to the default browser and says so.

## 3. `--open-with COMMAND`

`--open-with "my-shell {url}"` runs a command with the URL in place of `{url}` and treats its exit as the window closing. This is the "plugin": anyone can wrap the page in their own Tauri or Electron shell, and fullmark only starts it and watches the process. It is also settable as `open-with` in `config.toml`.

## Requirement: shared pages carry no server code

Heartbeats, close handling, submit and autosave exist only in pages served by fullmark. A page written by `build`, `share` or `publish` must not contain them, not even as dormant code: those pages make no network request, their CSP has no `connect-src`, and their bytes must stay identical whether or not this feature exists. The served variant adds a server module when it builds the page in memory, as `build --watch --serve` adds its reload code only to the served copy. v1 does this through an attach point in the page core and a separate server module ([TECHNICAL_DESIGN.md](../TECHNICAL_DESIGN.md), section 7, foundation 9); the heartbeat would be one more thing that module sends.

## Not proposed: a Tauri app

A real app would add fullscreen without a user gesture, a locked window, a tray icon and notifications. It would also add a Rust toolchain, WebView2 on Windows, a binary per OS, code signing and a second release process next to the npm package, turning a CLI and one offline file into a desktop product. A locked window buys little, since the answer key is in the page anyway ([USER_DESIGN.md](../USER_DESIGN.md), section 6). `--open-with` leaves the door open without fullmark owning an app.

## Cost once the seam exists

Close detection: a route, a timer, a flag and tests, about a day. `--open app`: finding the browser on three OSes, the profile folder, process handling, a day or two. `--open-with`: half a day.
