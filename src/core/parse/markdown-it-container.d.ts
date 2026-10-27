declare module "markdown-it-container" {
  import type { MarkdownIt } from "markdown-it";

  /** The plugin has no types of its own; this is the part of its API that we use. */
  export default function container(
    md: MarkdownIt,
    name: string,
    options?: { marker?: string; validate?(params: string, markup: string): boolean },
  ): void;
}
