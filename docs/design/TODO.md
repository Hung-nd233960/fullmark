# Design gaps to settle

Gaps and contradictions in the 1.0 design docs. Each item says where it is and, when there is one, the suggested fix. Remove an item when the docs are fixed.

The quiz syntax and `new --skeleton` are settled in [QUIZ_SYNTAX.md](QUIZ_SYNTAX.md). Gaps found while building step 1 are tracked in [docs/plans/archive/STEP1.md](../plans/archive/STEP1.md), section "Handoff".

## Before step 4 (library)

- [ ] **1.0 and 0.x share a config file.** Both read `%APPDATA%\fullmark\config.toml` (`~/.config/fullmark/config.toml` on Linux). `quiz check` already reads the owner's 0.x config; it parses, so nothing breaks yet. In step 4 a 0.x `library` path there would point 1.0 at a 0.x library it cannot read. Decide before step 4: a different folder for 1.0, or let the step 6 migration script rewrite the file.
