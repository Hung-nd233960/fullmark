/** The unit words of a duration: from the message catalog (`unitHour`, `unitMinute`, `unitSecond`). */
export type DurationUnits = { unitHour: string; unitMinute: string; unitSecond: string };

/**
 * Seconds as a short reading time: "45 s" under a minute, "50 min", "1 h 5 min", "2 h". Our own function, not
 * `Intl`, so every machine prints the same bytes. Seconds are rounded to a whole second (half up), then a
 * duration of a minute or more to a whole minute.
 */
export function formatDuration(seconds: number, u: DurationUnits): string {
  const s = Math.max(0, Math.floor(seconds + 0.5));
  if (s < 60) return `${s} ${u.unitSecond}`;
  const total = Math.floor(s / 60 + 0.5);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} ${u.unitMinute}`;
  return m === 0 ? `${h} ${u.unitHour}` : `${h} ${u.unitHour} ${m} ${u.unitMinute}`;
}
