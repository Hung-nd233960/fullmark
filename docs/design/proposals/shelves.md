# Proposal: several shelves and commands to manage them

**Status: the seams are adopted in v1 (2026-10-25); the `shelf ...` commands remain a proposal.** The v1 library format already has shelf membership as a list of entries (`shelves = [{ shelf = "public", kind = "quiz" }]`, `version` reserved), and the per-machine shelf folder in `config.toml` is keyed by shelf name ([TECHNICAL_DESIGN.md](../TECHNICAL_DESIGN.md), amendment of 2026-10-25). v1 commands touch only the shelf named `public`, through `publish NAME --on | --off`, and keep entries they do not know. Everything below the seams section is not in v1.

## The idea

A **shelf** is a published folder of quizzes (see TECHNICAL_DESIGN.md, section 10). Today a library has one, and a quiz is on it or not. This proposal allows several shelves (a public one, one per class or course), each holding **copies** of quizzes. The originals and their history stay in the library, so one quiz can be on many shelves:

```text
library (originals + history)
  fourier-basics ──copy──► shelf "public"      (GitHub Pages)
                 └─copy──► shelf "dtech-class" (shared with classmates)
  laplace-exam   ──copy──► shelf "dtech-class"
  ielts-mock-3   (on no shelf: private)
```

## Commands

`new` and `delete` act on shelves; `add` and `remove` act on the quizzes on a shelf.

```text
quiz library shelf new NAME DIR [--title TEXT]
quiz library shelf list
quiz library shelf info NAME
quiz library shelf rename OLD NEW
quiz library shelf set NAME [--title TEXT] [--fonts F] [--with-brief | --no-brief] [--lang L]
quiz library shelf delete NAME

quiz library shelf add NAME QUIZ...
quiz library shelf remove NAME QUIZ...

quiz library publish [NAME...] [--dry-run] [--json]
```

| Command | What it does |
|---|---|
| `shelf new` | Creates a shelf: a name, a folder and a title for its index page |
| `shelf list` | Every shelf with its folder, quiz count, how many copies are older than the library (stale), and the last publish |
| `shelf info` | A shelf's quizzes, the version on the shelf against the library's, and its settings |
| `shelf rename` | Changes the name only. The folder, its contents and the index title stay, so no published URL breaks |
| `shelf set` | Per-shelf settings: index title, `--fonts`, briefs, index page language |
| `shelf delete` | Forgets the shelf. Never deletes its folder; that is the user's to do with git |
| `shelf add`, `shelf remove` | Put copies on a shelf or take them off. Takes effect at the next `publish`. The quiz itself stays in the library |
| `publish` | Syncs the named shelves, or all of them. Same rules as today: build everything first, write only changes, commit only its own paths, never push |

Taking someone else's quizzes stays `library import`, which reads their shelf into your library; from there they can be added to your own shelves.

`publish NAME --on | --off` goes away: `shelf add public NAME` replaces it.

## Storage

- **`library.toml`** (committed, moves with the library): the shelves' names, titles, settings and which quizzes are on each.
- **`config.toml`** (per machine): each shelf's folder path. On a new machine, `publish` exits 3 with "shelf `public` has no folder on this machine" and the command to set it.
- **Migration:** none. The seams were adopted before 1.0 shipped, so a v1 library already has its `public` entries.

## Seams adopted in v1

1. **Membership is a list of entries, not a flag.** Each entry is `{ shelf, kind, version? }`, so a quiz can be on several shelves.
2. **An entry has a kind**: `quiz` in v1, `bundle` later ([multi-quiz-bundle.md](multi-quiz-bundle.md)), so a shelf can list a bundle as one item.

The optional `version` leaves room for pinned copies: a class shelf keeping the version handed out before an exam while the library moves on.

## Left out

- Deleting a shelf's folder.
- Moving a quiz between shelves: `add` then `remove` does it.
- Pinned versions: later, with the entry format already allowing them.
