# Proposal: shell integration (completion, prediction, tldr page, Starship)

**Status: proposal, cherry on top.** [TECHNICAL_DESIGN.md](../TECHNICAL_DESIGN.md) and [COMMANDS.md](../COMMANDS.md) do not include it. It fits late in 1.0 or in a 1.x release; nothing here changes a file format. One seam is worth keeping in v1 (below), so adding it later is cheap.

## The idea

Make `quiz` pleasant to type by hand, without changing what agents see:

1. **Completion:** Tab completes subcommands, flags and live values (quiz names, attempt stamps, templates) in the common shells.
2. **Prediction:** the shell's own as-you-type suggestions pick up the same data, with no extra work.
3. **A tldr page** kept in this repo and tested, so `tldr quiz` never shows an outdated flag.
4. **A prompt segment** (for Starship or any prompt) that shows when you are anywhere inside a library or a shelf.

Agents are unaffected: everything here is opt-in per shell, and nothing changes the output of a command.

## 1. Completion

### What is worth completing

| Position | Candidates | Source |
|---|---|---|
| Subcommands and flags | `check`, `build`, `library take`, `--profile`, ... | the commander definitions |
| Flag values with a fixed set | `--fonts` (`quiz`, `all`, `none`), `--lang` (`en`, `vi`), `quiz new TEMPLATE` | declared choices |
| Profiles | `--profile exam` | built-in profiles plus `config.toml` and the nearest `fullmark.toml` |
| Library quizzes | `quiz library take fou` → `fourier-basics` | the library index (name and id) |
| Attempts, versions | stamps and hashes, newest first | the quiz's history folder |
| Sections | `--section` slugs | the quiz's IR, only if it is cheap to read |
| Rule ids | `quiz rules ...` | the rule registry |
| Files | `quiz check` → `*.md`; `quiz grade` → `*-results-*.json` | a file filter, left to the shell |

Values are completed as written in [COMMANDS.md](../COMMANDS.md), never translated. A description shown next to a value follows the tool language.

### How: ask the program (the cobra pattern)

The completion logic lives in `quiz` itself, as a hidden command that the shell runs on each Tab:

```text
quiz __complete library take fou
fourier-basics  Fourier basics (12 questions)
fourier-exam    Fourier exam
:nofile
```

One candidate per line, `value<TAB>description` (shown with spaces above), then a last line with a directive: `nofile` (no file fallback), `nospace` (no space after the value), `files:md` (complete files with this extension) or `default`.

`quiz shell-init SHELL` prints a small shim for that shell (plus the prompt hook of section 4), which turns Tab into a `quiz __complete ...` call and the answer into the shell's own format. The logic is written once, in TypeScript, and tested once.

Why this and not a static script baked with every flag (the way `uv` or `rg` do it):

- The interesting values are dynamic: library names, stamps, profiles from `fullmark.toml`. A static script cannot know them.
- 1.0 starts in about 0.1 s (the 150 ms budget in TECHNICAL_DESIGN.md, section 8), so a call per Tab feels instant. The Python 0.x CLI took 0.65 s, which is why this did not make sense before.
- A static script goes stale after an upgrade; asking the program cannot.

If Tab ever feels slow, the fallback is a hybrid: bake the subcommands and flags into the shim and call `__complete` only for values.

### Shells

| Shell | Shim | Notes |
|---|---|---|
| **PowerShell** | `Register-ArgumentCompleter -Native` script block | Windows default; also on Linux as `pwsh` |
| **bash** | `complete -F` function | Git Bash and most Linux machines. Works with or without the `bash-completion` package |
| **zsh** | `compdef` function using `_describe` | Shows the descriptions |
| **fish** | `complete -c quiz -f -a '(quiz __complete ...)'` | Shows the descriptions; fish also turns completions into suggestions |
| **nushell** | an external completer closure for `$env.config.completions.external` | nushell calls one completer for all programs, so the shim routes `quiz` and `fullmark` to `__complete` and passes others through (to carapace, if the user has it) |
| dash | none | dash has no programmable completion. It is the non-interactive `/bin/sh` on Debian and Ubuntu, not a shell people type in |

Install is one line per shell in the shell's start-up file, printed by `quiz shell-init --help`, in the style of `zoxide init`: for example `quiz shell-init powershell | Out-String | Invoke-Expression` in the PowerShell profile, or `quiz shell-init fish | source` in `config.fish`. Both `quiz` and `fullmark` are registered. The name is `shell-init`, not `init`, so it cannot be confused with `quiz library init`.

### Rules for `__complete`

- **Read-only and quiet.** It never writes, never takes the library lock, never prompts, and prints nothing but candidates. Any error means no candidates and exit 0, so a broken library never prints noise into the prompt.
- **Fast path.** It loads only the command definitions, the config and the library index: no Shiki, KaTeX, esbuild or page bundle. Command actions already import their heavy modules lazily for the startup budget; `__complete` relies on that.
- **Budget:** under 100 ms for a library value on the laptop, under the 150 ms startup budget for everything else. A test enforces both, like the startup test.
- **Hidden** from `--help`, `--json` command listings and `AGENTS.md`.

### Libraries to look at first

commander has no completion of its own. Before writing the shims, check `@bomb.sh/tab` (shims for bash, zsh, fish and PowerShell, with a commander adapter) and `tabtab` (no PowerShell). If one covers four of the five shells with a protocol like the one above, use it and write only the nushell shim.

## 2. Prediction

Nothing to build: prediction is the shell's job, and it reuses completion.

- **PowerShell** (PSReadLine): history suggestions already work for every command. With the CompletionPredictor module, suggestions also come from completers, so `quiz lib` suggests `quiz library`. PSReadLine gives a predictor only a few tens of milliseconds, so a value that needs `__complete` may not appear as a suggestion; Tab still works. That is acceptable, not a bug to chase.
- **fish:** autosuggestions come from history and completions out of the box.
- **zsh** (zsh-autosuggestions), **bash** (ble.sh), **nushell** (hints): history based; completion still feeds their Tab menus.

The only requirement on fullmark is that `__complete` is fast and quiet, which section 1 already asks.

## 3. tldr page

Today the page lives outside the project, in the owner's dotfiles. Move it here as `docs/tldr/quiz.page.md` (the custom-page format that tealdeer reads from `custom_pages_dir`). English only; tldr has language folders if a Vietnamese page is ever wanted.

- **Tested:** a test parses every example command on the page through the commander definitions, so a renamed or removed flag fails CI instead of lingering in `tldr quiz`.
- **Short:** at most 8 examples (tldr's own guideline), daily commands only: `check`, `build --open`, `serve --once --open`, `brief --web`, `review`, `library take`, `guide`.
- **Installed** by copying or linking it into the custom pages folder. The dotfiles keep their copy until then.

## 4. Prompt segment (Starship)

A prompt segment such as `📚 my-library` anywhere inside a library, subfolders included, and `🗂 public` inside a shelf, so it is clear where `quiz library ...` will act. It must be exact and free: right in every folder, and no process started per prompt.

### Why not a Starship custom module

The obvious approaches each fall short:

| Approach | Problem |
|---|---|
| `[custom]` with `detect_files` | Starship looks only in the current folder, not its parents, so the segment vanishes one level down |
| `[custom]` running `quiz` | A Node start per prompt (about 0.1 s) makes every prompt slower |
| `[custom]` with `when` running a shell script | Starship starts a new shell for it on every prompt; on Windows that is a `pwsh` start, slower still |

### How: the shell knows, Starship only displays

The one-line setup that `quiz shell-init SHELL` prints (section 1) also adds a small hook, written in the shell's own language, that runs **inside the shell process** when the folder changes:

1. Walk up from the current folder to the drive or filesystem root, and stop at the first folder holding `library.toml` (a library) or `fullmark-shelf.json` (a shelf). The nearest marker wins, so a shelf inside a library shows the shelf.
2. Set `FULLMARK_PROMPT` to `📚 <folder name>` or `🗂 <folder name>`, or unset it when there is no marker.

That is a few file-exists checks per folder change and no process at all. Starship then shows the variable with its built-in `env_var` module, which also starts nothing:

```toml
[env_var.FULLMARK_PROMPT]
format = "[$env_value]($style) "
style = "bold yellow"
```

When the variable is unset, Starship prints nothing. The variable also works without Starship: any prompt can show `$FULLMARK_PROMPT`.

| Shell | Hook | Runs |
|---|---|---|
| PowerShell | wraps the existing `prompt` function, so `quiz shell-init` goes after `starship init` in the profile | each prompt, walking only when `$PWD` changed |
| bash | a function prepended to `PROMPT_COMMAND`, so it runs before Starship's | each prompt, walking only when `$PWD` changed |
| zsh | `chpwd` hook, plus one run at start-up | on `cd` only |
| fish | a function with `--on-variable PWD` | on `cd` only |
| nushell | `$env.config.hooks.env_change.PWD` | on `cd` only |

### Details

- **The folder name, not a title.** The hook reads no TOML or JSON, so it stays a few lines in each shell and never breaks on a format change. The folder name is what you `cd` into anyway.
- **False positives.** `library.toml` is a generic name. If 1.0's `library.toml` has a fullmark-specific key, the hook checks for it with a plain text match; if that turns out to be needed, the key is part of the seam below.
- **Opt out:** `quiz shell-init SHELL --no-prompt` prints only completion. fullmark never edits `starship.toml` or the shell profile; `quiz guide` shows the snippet above.
- **Tested** like the shims: a smoke test per installed shell runs the hook in a temporary tree (root, subfolder, shelf inside a library, no marker) and checks the variable.

## The seam to keep in v1

- Commands, flags and choices are declared once, in the commander definitions, with fixed sets as declared choices rather than checks inside an action. Help, `--json` listings, completion and the tldr test all read the same definitions.
- Heavy modules are imported inside actions, not at the top of the CLI entry (already needed for the startup budget).
- The command names `__complete` and `shell-init` are reserved.
- The marker files keep their names: `library.toml` at a library's root and `fullmark-shelf.json` at a shelf's root.

## Left out

- **A static completion generator per shell:** more code than the shims, and still unable to complete library values.
- **Completion of things inside a quiz** (question ids, assets): no command takes them by hand often enough.
- **Editing the user's shell profile** (`quiz shell-init --install`): printing the line is enough, and a tool that edits dotfiles surprises people.
- **A Starship `[custom]` module:** see section 4.

## Cost

| Part | Estimate |
|---|---|
| `__complete` engine, value sources, tests | about a day |
| Shims for PowerShell, bash, zsh, fish and nushell | half a day with a library, a day without, plus a smoke test in each shell that is installed |
| tldr page and its test | an hour |
| Prompt hook in five shells, with smoke tests | half a day |
