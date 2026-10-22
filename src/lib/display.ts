import { formatDate, formatDateTime, formatTime, relativeTime, tzLabel, utcToZonedLocal } from "@/lib/time";

/** Server-side display helpers bound to the configured timezone (Asia/Kolkata by default). */
export const DISPLAY_TZ = process.env.DISPLAY_TIMEZONE || "Asia/Kolkata";

type D = Date | string | null | undefined;

export const dt = (d: D) => formatDateTime(d, DISPLAY_TZ);
export const dDate = (d: D) => formatDate(d, DISPLAY_TZ);
export const dTime = (d: D) => formatTime(d, DISPLAY_TZ);
export const rel = (d: D) => relativeTime(d);
export const tzName = () => tzLabel(DISPLAY_TZ);
/** For `datetime-local` default values. */
export const toLocalInput = (d: D) => utcToZonedLocal(d, DISPLAY_TZ);

export function pct(n: number | null | undefined) {
  return n === null || n === undefined ? "—" : `${n}%`;
}

export function marks(n: number | null | undefined, max: number) {
  if (n === null || n === undefined) return `— / ${max}`;
  return `${Math.round(n * 100) / 100} / ${max}`;
}
