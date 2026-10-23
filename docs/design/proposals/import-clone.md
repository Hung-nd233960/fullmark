# Proposal: `quiz library import --clone`

**Status: proposal, not evaluated, not in v1 scope.** [DESIGN.md](../DESIGN.md) and [COMMANDS.md](../COMMANDS.md) do not include it. Decide on it after `publish` and `import` (step 5 of the work order) have been used for a while.

## The idea

Let `import` take a Git URL: clone a published fullmark shelf (a folder written by `quiz library publish`) and import its quizzes in one step.

## Two use cases

| Use case | What should happen |
|---|---|
| **Restore your own shelf** on a new machine (a new laptop, a lab workstation) | Clone into a folder that is kept. Import the quizzes as public, and remember that folder as the publish folder, so the next `publish` writes back into it |
| **Take someone else's quizzes** (a classmate's or a course's shelf) | Clone into a temporary folder. Import the quizzes **not public**, record where they came from, then delete the clone |

The second case is the trap. If imported quizzes kept `public = true`, the next `publish` would put someone else's quizzes on your own shelf. So the safe case is the default, and restoring needs an explicit flag.

## Proposed commands

```text
quiz library import --clone URL [--into PATH] [--json]
quiz library import --clone URL --shelf DIR [--into PATH] [--json]
```

| Option | Meaning |
|---|---|
| `--clone URL` | Shallow `git clone` into a temporary folder, import, record `origin = URL` on each quiz in `library.toml`, leave `public` unset, delete the clone |
| `--shelf DIR` | Clone into `DIR` and keep it instead. Quizzes are imported as public, and `DIR` becomes the remembered publish folder. Refused (exit 2) if `DIR` exists and is not empty |
| `--into PATH` | As for `import`: create the library at `PATH` first |

- `library list` shows each quiz's origin.
- **Re-running** with the same URL works as an update: the same id and hash is `unchanged`, and a new hash adds a version. That is how you would pull a classmate's corrections.
- All other behaviour (checks before writing, one commit, name clashes refused with a suggested free name while the other quizzes still import) is that of `import`.

## Safeguards

- **Network only when asked.** `--clone` names it, which fits "no network unless the command says so". fullmark runs `git` and never handles credentials: private repositories use the user's own git login. If `git` is missing, exit 2.
- **A manifest is required.** Without `fullmark-shelf.json`, exit 1. Scanning an arbitrary repository for `*/*.md` would import junk, so the manifest-less fallback of `import DIR` does not apply to clones.
- **Untrusted content.** Every manifest path must be relative and resolve inside the clone, so `../` and absolute paths are refused. Symlinks are refused. Asset size limits apply. Every quiz must pass `check` before anything is written.
- **Custom profiles** from the clone's `fullmark.toml` are safe to read because checks are declarative. This proposal depends on that: it would not be safe with JavaScript plugin rules.
- **Origin is recorded** so a quiz from someone else can always be told apart from your own.

## Open questions

1. **Is `--shelf` needed?** Restoring your own shelf can already be done by hand: `git clone URL DIR`, then `quiz library import DIR`, then `quiz library publish DIR`. If that happens once per machine, the flag may not earn its place.
2. **Is a separate update command needed** (`library update NAME`, pulling from the quiz's origin)? Probably not: re-running `import --clone URL` covers it.
3. **Should third-party quizzes be marked in the page or in reports** (for example "from github.com/...")? Today nothing in the page shows who wrote a quiz.
4. **Should `publish` refuse a quiz that has a foreign `origin`**, even when someone sets `--on` by hand? That would make the safe default a hard rule.

## Alternative: do nothing

`git clone URL tmp && quiz library import tmp` already works with the v1 commands, except for the origin record and the "not public" default. If third-party quizzes turn out to be rare, a paragraph in the guide may be enough.

## Tests, if built

- A cloned shelf imports with `public` unset and `origin` set. A later `publish` does not include those quizzes.
- `--shelf DIR` keeps the clone, imports the quizzes as public, and remembers `DIR`. Then publish, import into an empty library, and publish again gives `unchanged`.
- Re-running `--clone` on the same URL: no change gives `unchanged`; one edited quiz gives one new version.
- A manifest with `../` paths, absolute paths or symlinks is refused, with nothing written.
- A repository without a manifest exits 1.
- Clones are tested against a local bare repository (`file://`), never the network.
