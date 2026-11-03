/** A complete `brief.yaml`: the file holds every key (COMMANDS.md, `quiz brief`), so tests start from this one. */
export const BASE_BRIEF = {
  purpose: "self-study",
  scope: "lectures 3 to 5, the Fourier transform",
  content: { kinds: [] as string[], kinds_other: "", elsewhere: "" },
  count: 3,
  minutes: 0,
  mix: ["recall", "understanding"],
  difficulty: "like-the-exam",
  mode: "at-the-end",
  weak_topics: false,
  commitment: 0,
  focus_tags: [] as string[],
  language: "en",
  request: "",
  profile: "default",
  decided_by: {
    purpose: "user",
    scope: "user",
    content: "default",
    count: "default",
    minutes: "default",
    mix: "default",
    difficulty: "default",
    mode: "default",
    weak_topics: "default",
    commitment: "default",
    focus_tags: "default",
    language: "default",
    request: "default",
    profile: "default",
  },
};

export type BriefValues = typeof BASE_BRIEF;

/** The YAML text of a brief: the base with some keys changed, or removed with `undefined`. */
export function briefYaml(overrides: { [K in keyof BriefValues]?: BriefValues[K] | undefined } = {}): string {
  const values: Record<string, unknown> = { ...BASE_BRIEF, ...overrides };
  const lines: string[] = [];
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) continue;
    if (key === "content" || key === "decided_by") {
      lines.push(`${key}:`);
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) lines.push(`  ${k}: ${JSON.stringify(v)}`);
    } else lines.push(`${key}: ${JSON.stringify(value)}`);
  }
  return `${lines.join("\n")}\n`;
}
