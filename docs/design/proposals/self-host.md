# Proposal: self-hosting (a library server)

**Status: proposal, not in v1 scope.** It relies on v1 pieces that already exist: pages are static and can be published as a shelf, results are `results-v2` files that carry the quiz hash, the one-shot server already checks `Host` and `Origin`, caps the body and takes a token, and the library is a git repository that core never imports.

## The idea

Run fullmark on a homelab server so a quiz is reachable from any device, and attempts come back to one library. Git and GitHub are two separate things for a reason; this proposal is the GitHub half, so it is kept in stages, and each stage is a place to stop.

| Stage | What you get | New code | Stop here if |
|---|---|---|---|
| **0. Static hosting** | Pages reachable from phones and other machines. Nothing comes back | none: a how-to | you only need to open quizzes elsewhere |
| **1. A library server with an admin account** | Remote libraries: register, take and pull results through an address | a server mode, a protocol, one account, device tokens | you are the only user |
| **2. More accounts** | Classmates log in, take quizzes, see their own results | accounts, roles, invites, per-user storage | you share quizzes with people who need their own history |

Each stage assumes the one before it. Stage 2 is not planned; it is written down so that stage 1 does not close the door.

## Stage 0: static hosting (a how-to, no code)

`quiz library publish DIR` writes a shelf, which is plain static files. Serve `DIR` with Caddy or nginx on the homelab and put it behind Tailscale (`tailscale serve` gives https), or use GitHub Pages. A phone needs https for storage to work ([TECHNICAL_DESIGN.md](../TECHNICAL_DESIGN.md), section 7, foundation 8). Results stay on the device that took the quiz and are exported by hand. This is the answer to "universal access" for most uses.

## Stage 1: a library server

### Commands

```text
quiz host init [--library PATH]                  # on the server: create the admin account
quiz host [--bind ADDR] [--port N]               # run the server
quiz host token list | revoke NAME

quiz library remote add NAME ADDRESS            # log in as the admin (asks for the password)
quiz library remote list | rm NAME
quiz library list --remote NAME
quiz library register FILE... --remote NAME     # upload; the server checks and commits
quiz library take NAME --remote NAME            # the server hosts the page and files the result
quiz library pull NAME                          # copy the remote library's results into a local one
```

`--remote` is accepted by the library commands that make sense against a server and refused by the rest. The server runs the same core and library code as the CLI; the protocol only moves quiz sources, built pages and result files.

### The admin account

- **Created on the server, never over the network.** `host init` asks for a password and stores a hash (scrypt, from `node:crypto`, so no dependency). There is no sign-up route.
- **Login gives a device token.** `remote add` sends the password once over https and gets back a long random token, stored in `config.toml` (user config, mode 600 where the OS has modes). The password is not stored on the client. `host token revoke` ends a device's access without changing the password.
- **One library per server, one admin.** The admin can do everything the CLI can on a library, except the commands that take a path on the server's disk.

### Network and safety

- The server binds `127.0.0.1` by default. `--bind` takes a Tailscale or LAN address. It refuses a non-loopback bind without https (a certificate given with `--cert`, or a header from a reverse proxy named with `--trusted-proxy`), unless `--insecure` is given.
- The v1 checks carry over: `Host` and `Origin` validation, body caps, one accepted submit per attempt, atomic writes. Login attempts are rate-limited per address.
- Pages served by the host may post to their own origin (`connect-src 'self'`); every other page keeps `default-src 'none'`.
- The library is committed by the server, one writer at a time under a lock. fullmark still never pushes.
- Answer keys ship inside every page, obfuscated, exactly as in a shelf: a hosted quiz is no more secure than a published one. Results hold the learner's answers, so the server's disk and backups are the owner's responsibility.

### What changes in v1 documents

[TECHNICAL_DESIGN.md](../TECHNICAL_DESIGN.md) says the one-shot server is the only network exception, and the README says there are no accounts and no network use outside it. Both would need to say that `quiz host` is the second exception, off by default, started only by the owner. Nothing in v1 formats changes: a result filed by the server is an ordinary `results-v2` file with a `by` field naming the device or account.

## Stage 2: more accounts

Roles (`admin`, `learner`), invites from the admin (a one-time link, not open sign-up), a results folder per account, and quiz visibility (private, listed for named accounts, or public by link). Password reset by the admin only. This is where a web interface for browsing and grading would start to be wanted, and where the work stops being a library server and becomes an application: sessions, a user store, migrations, email or no email. It is listed so that stage 1 keeps accounts as an object (an id, a name, a role) and does not hard-code "the admin".

## Open questions

- **Git or API for syncing a whole library between machines.** The library is already a git repository, so `git push` and `pull` move everything and results never conflict (each is a new file). `library pull` is then only a convenience. Which one is the primary path?
- **Does the server build pages on request or keep them?** On request is simpler and always current; kept is faster and needs invalidation.
- **Autosave across devices.** Keyed by account and quiz, so an attempt started on a phone resumes on the laptop. Worth it for stage 1, or later?
- **Windows service and systemd.** A sample unit file and a note, or nothing: the owner runs it in a terminal or a process manager.
- **Protocol versions.** One owner means client and server can be kept in step, so a version check that refuses a mismatch with a clear message may be enough.

## Cost

Stage 0: an hour for the how-to. Stage 1: three to five weeks, mostly the protocol and its tests with two processes, login and token handling, the lock around library writes, and https handling. Stage 2: not estimated; treat it as a separate project.
