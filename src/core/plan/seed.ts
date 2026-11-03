/**
 * What is wrong with a seed (TECHNICAL_DESIGN.md, section 4, Seeds): it must be 1 to 8 letters or digits. `planFor` holds
 * the same rule and says the same words (a test keeps them together); this copy is for `build --seed` and the build file,
 * which must refuse before a plan is drawn, and it sits apart so that the page's runtime does not carry it.
 */
const SEED = /^[A-Za-z0-9]{1,8}$/;

export const seedProblem = (seed: string): string | null =>
  SEED.test(seed) ? null : `seed "${seed}" must be 1 to 8 letters or digits`;
