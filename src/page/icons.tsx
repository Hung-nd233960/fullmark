import type { ComponentChildren } from "preact";

/** The board's line icons (docs/mockup, Quiz and Results boards): 24-unit paths, drawn with `currentColor`. */
const PATHS = {
  check: <path d="M5 13l4 4L19 7" />,
  cross: <path d="M6 6l12 12M18 6L6 18" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7.5v.01" />
    </>
  ),
  flag: <path d="M5 21V4h11l-2 4 2 4H5" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  retry: <path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5" />,
  download: <path d="M12 4v11m-5-4l5 5 5-5M5 20h14" />,
  half: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" />
    </>
  ),
  dash: <path d="M6 12h12" />,
  dot: <circle cx="12" cy="12" r="2.5" fill="currentColor" />,
} satisfies Record<string, ComponentChildren>;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 16, stroke = 2 }: { name: IconName; size?: number; stroke?: number }) {
  return (
    <svg
      class="fm-svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width={stroke}
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
