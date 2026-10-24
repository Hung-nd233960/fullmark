# Proposal: Vietnamese typo checks in `check`

**Status: idea, not in v1 scope.** [TECHNICAL_DESIGN.md](../TECHNICAL_DESIGN.md) and [COMMANDS.md](../COMMANDS.md) do not include it. Judged too complicated for v1; revisit if typos in Vietnamese quizzes, especially in answer keys, turn out to be a real problem in use.

## The idea

Vietnamese words are built from syllables, and the set of valid syllables is closed (about 7,000 in real use): an onset, a vowel group, a final and one tone mark, with fixed rules on which combinations exist. A rule can therefore say that a word cannot be Vietnamese, without a dictionary and without flagging English terms.

| Typo | Example | Detectable |
|---|---|---|
| Telex or VNI keys left in | `tieengs`, `vieetj`, `ngu7` | ✓ |
| Impossible syllable | `ngê`, `kă`, `quuá` | ✓ |
| Two tone marks, or one on the wrong letter | `tóàn` | ✓ |
| Valid syllable, wrong word | `dữ liêu` for `dữ liệu` | ✗ needs a dictionary or a model |
| Text typed without diacritics | `bien doi Fourier` | ~ heuristic only |

## Possible rules

Quality rules, active only in a `lang: vi` quiz:

- `text.vi-syllable` (warning): a word with Vietnamese diacritics that is not a valid syllable, or that ends in Telex or VNI keys. Plain ASCII words, code, math and inline code are skipped. In short-answer and fill-in answer keys it is an error under `exam`, because a typo there marks the right answer wrong.
- `text.not-nfc` (warning): text stored in decomposed form.
- `text.tone-style` (off): both tone placements (`hoà` and `hòa`) used in one quiz.

## Left out even then

- Dictionary spell checking (Hunspell `vi`): noisy on technical text.
- AI proofreading: not deterministic, so it belongs in `quiz review`, not `check`.
- English spell checking: no closed syllable set, so the same noise problem.

## Cost

A syllable table and a tokenizer in `core/rules`, about a day, plus fixtures for each typo kind.
