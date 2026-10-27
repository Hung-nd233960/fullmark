# Proposal: finding quizzes in a library (filters on `library list`)

**Status: the filters are a proposal, not in v1 scope. `library info` was moved into v1 (2026-10-27)**: it only reads what `inspect`, `list` and `stats` already compute, and its spec is in [COMMANDS.md](../COMMANDS.md). The filters need one seam in v1: the field names of `library list --json` (below).

## The idea

With a few quizzes, `library list` is enough. With a hundred (a term of signals, an IELTS course, JLPT vocabulary) two questions come up:

1. **Everything about one quiz**, in one place, without running `inspect`, `list` and `stats` and reading the library folder.
2. **Which quizzes match** some facts: tagged `fourier`, in Vietnamese, last score under 70 %, never taken, on the public shelf, source changed since registering. The result is read, or handed to a command that takes several names.

## `quiz library info`

Adopted in v1 ([COMMANDS.md](../COMMANDS.md)). It is called `info`, like `shelf info` in [shelves.md](shelves.md), since both describe one named thing. If reference sheets come ([reference-sheet.md](reference-sheet.md)), its Content block lists them.

## Filters on `quiz library list`

```text
quiz library list [TERM...] [--sort FIELD] [--names] [--plain] [--json]
```

```text
quiz library list tag:fourier lang:vi
quiz library list score:<70 taken:>=2026-09-01
quiz library list taken:never -tag:draft
quiz library list tag:laplace,z-transform shelf:public
quiz library list changed:yes --names
```

### The grammar, all of it

- A **term** is `field:value`. Terms separated by spaces must all match (AND).
- `-` before a term negates it.
- A comma inside a value means any of them: `tag:laplace,z-transform`.
- Numbers and dates take `<`, `<=`, `>`, `>=` after the colon. Dates are `YYYY-MM-DD` only, so the same query on the same library always gives the same list.
- A bare word matches the name or title, ignoring case and Vietnamese diacritics.
- Nothing else: no parentheses, no OR across fields, no quoting rules beyond the shell's.

An unknown field or a malformed value exits 2 with the list of fields and the nearest match (`tags:` → did you mean `tag:`?).

### Fields

| Field | Type | Matches |
|---|---|---|
| `name`, `title` | text | substring |
| `tag` | text | any question tag in the current version |
| `type` | text | the quiz has a question of this type (`essay`, `code`, `numeric`) |
| `kind`, `lang`, `profile` | text | exact |
| `shelf` | text | the quiz has an entry on this shelf |
| `questions`, `points`, `versions`, `attempts` | number | |
| `score`, `best` | number (percent) | last and best score; quizzes never taken do not match |
| `weak` | text | a tag among the three weakest over all attempts |
| `added`, `updated`, `taken` | date | first version, current version, last attempt; `taken:never` |
| `changed` | `yes` / `no` | the original source has changed since the current version |
| `ungraded` | `yes` / `no` | an attempt has essays or code not yet graded |

`--sort FIELD` sorts by one field (`-score` for descending), with the fixed comparison of TECHNICAL_DESIGN.md (section 7, foundation 6); the default is by name.

### Batch use

`--names` prints one name per line and nothing else, for commands that take several names, in any shell:

```powershell
quiz library shelf add dtech-class (quiz library list tag:laplace --names)
```

```sh
quiz library shelf add dtech-class $(quiz library list tag:laplace --names)
```

No command takes a query in place of names. `rm` and `rename` stay one quiz per command, as decided in [COMMANDS.md](../COMMANDS.md), so a query can never delete a set of quizzes.

### Why not SQL

- A library holds tens to a few hundred quizzes, and the questions asked of it are a few facts joined by AND. That is what the term grammar covers.
- SQL means a parser, joins (quizzes, versions, attempts, tags), quoting that fights PowerShell, and a second language to document in two languages and keep stable once agents and scripts depend on it.
- Anything the terms cannot say, `list --json` and `jq` or PowerShell's `Where-Object` can, over the same fields.

## Seam in v1

Fix the row shape of `library list --json` now, with the field names of the table above, so filters are later a function over those rows and scripts written against v1 keep working. Fields v1 does not compute yet are left out of the row, not renamed.

## Left out

- **Searching questions across quizzes** (every question tagged `convolution`, to build a review quiz). It needs question-level rows and a way to assemble a quiz from them; a separate proposal if it is wanted.
- **Full-text search** of question text. A bare word matches names and titles only; `rg` over the library folder searches the sources.
- **Saved queries.** A shell alias does it.
- **Relative dates** (`taken:<7d`): they depend on the clock, so a query's result would change overnight. Write the date.

## Cost

`library info`: one to two days, mostly layout and the version diff. Filters: three to five days: the term parser, field extraction from the library and the attempt history, `--names` and `--sort`, error messages with suggestions, and table tests over a fixture library.
