/**
 * Time helpers. Everything is stored in UTC; display uses the configured timezone
 * (Asia/Kolkata by default) and always shows a timezone label.
 * Safe to import on the client: the timezone is passed in explicitly where needed.
 */

export const DEFAULT_TZ = "Asia/Kolkata";

const TZ_LABELS: Record<string, string> = { "Asia/Kolkata": "IST" };

export function tzLabel(tz: string = DEFAULT_TZ): string {
  if (TZ_LABELS[tz]) return TZ_LABELS[tz];
  const part = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" })
    .formatToParts(new Date())
    .find((p) => p.type === "timeZoneName");
  return part?.value ?? tz;
}

type DateInput = Date | string | number | null | undefined;

function toDate(value: DateInput): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** e.g. "22 Oct 2026, 6:30 pm IST" */
export function formatDateTime(value: DateInput, tz: string = DEFAULT_TZ): string {
  const d = toDate(value);
  if (!d) return "—";
  const s = new Intl.DateTimeFormat("en-IN", {
    timeZone: tz,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(d);
  return `${s} ${tzLabel(tz)}`;
}

/** e.g. "22 Oct 2026" */
export function formatDate(value: DateInput, tz: string = DEFAULT_TZ): string {
  const d = toDate(value);
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-IN", { timeZone: tz, day: "numeric", month: "short", year: "numeric" }).format(d);
}

/** e.g. "6:30 pm IST" */
export function formatTime(value: DateInput, tz: string = DEFAULT_TZ): string {
  const d = toDate(value);
  if (!d) return "—";
  const s = new Intl.DateTimeFormat("en-IN", { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true }).format(d);
  return `${s} ${tzLabel(tz)}`;
}

/** Offset of `tz` from UTC at instant `date`, in minutes (IST = +330). */
export function tzOffsetMinutes(date: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - date.getTime()) / 60000);
}

/**
 * Converts a `datetime-local` value ("2026-10-22T18:30"), interpreted as wall-clock time in `tz`,
 * to a UTC Date. Returns null for empty/invalid input.
 */
export function zonedLocalToUtc(local: string | null | undefined, tz: string = DEFAULT_TZ): Date | null {
  if (!local) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(local.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  const naive = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s ?? 0));
  // Two passes handle zones whose offset differs either side of the instant.
  let guess = naive - tzOffsetMinutes(new Date(naive), tz) * 60000;
  guess = naive - tzOffsetMinutes(new Date(guess), tz) * 60000;
  return new Date(guess);
}

/** Formats a UTC date as a `datetime-local` input value in `tz`. */
export function utcToZonedLocal(value: DateInput, tz: string = DEFAULT_TZ): string {
  const d = toDate(value);
  if (!d) return "";
  const shifted = new Date(d.getTime() + tzOffsetMinutes(d, tz) * 60000);
  return shifted.toISOString().slice(0, 16);
}

/** Human relative time, e.g. "in 3 h", "2 d ago". */
export function relativeTime(value: DateInput, now: Date = new Date()): string {
  const d = toDate(value);
  if (!d) return "—";
  const diff = d.getTime() - now.getTime();
  const abs = Math.abs(diff);
  const min = 60_000;
  const hour = 60 * min;
  const day = 24 * hour;
  let text: string;
  if (abs < min) text = "less than a minute";
  else if (abs < hour) text = `${Math.round(abs / min)} min`;
  else if (abs < day) text = `${Math.round(abs / hour)} h`;
  else text = `${Math.round(abs / day)} d`;
  if (abs < min) return diff >= 0 ? "in under a minute" : "just now";
  return diff >= 0 ? `in ${text}` : `${text} ago`;
}

/** Start of the current day in `tz`, as a UTC instant. */
export function startOfZonedDay(now: Date = new Date(), tz: string = DEFAULT_TZ): Date {
  const local = utcToZonedLocal(now, tz).slice(0, 10);
  return zonedLocalToUtc(`${local}T00:00`, tz)!;
}
