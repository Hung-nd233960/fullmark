export const JSX: { jsx: "automatic"; jsxImportSource: string };
export const CLI_BANNER: string;
export const CLI_EXTERNAL_PATTERNS: RegExp[];
export const CLI_EXTERNAL: string[];
export const CLI_BUNDLE: {
  format: "esm";
  target: string;
  platform: "node";
  splitting: boolean;
  banner: { js: string };
  jsx: "automatic";
  jsxImportSource: string;
};
export const PAGE_BUNDLE: {
  bundle: boolean;
  minify: boolean;
  format: "iife";
  platform: "browser";
  target: string;
  legalComments: "none";
  jsx: "automatic";
  jsxImportSource: string;
};
export const SERVE_BUNDLE: typeof PAGE_BUNDLE;
export const RELOAD_BUNDLE: typeof PAGE_BUNDLE;
