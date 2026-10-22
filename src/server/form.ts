import { zonedLocalToUtc } from "@/lib/time";

/** Helpers for reading FormData in Server Actions. All values are untrusted and validated by zod afterwards. */
const TZ = process.env.DISPLAY_TIMEZONE || "Asia/Kolkata";

export function str(fd: FormData, name: string): string {
  const v = fd.get(name);
  return typeof v === "string" ? v : "";
}

export function optStr(fd: FormData, name: string): string | null {
  const v = str(fd, name).trim();
  return v ? v : null;
}

export function bool(fd: FormData, name: string): boolean {
  const v = fd.get(name);
  return v === "on" || v === "true" || v === "1";
}

export function list(fd: FormData, name: string): string[] {
  return fd
    .getAll(name)
    .filter((v): v is string => typeof v === "string" && v.length > 0);
}

/** Parses a `datetime-local` value entered in the display timezone into a UTC Date. */
export function dateTime(fd: FormData, name: string): Date | undefined {
  return zonedLocalToUtc(str(fd, name), TZ) ?? undefined;
}

export function optDateTime(fd: FormData, name: string): Date | null {
  return zonedLocalToUtc(str(fd, name), TZ);
}

/** Parses a `date` input (YYYY-MM-DD) as midnight in the display timezone. */
export function dateOnly(fd: FormData, name: string): Date | null {
  const v = str(fd, name);
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? zonedLocalToUtc(`${v}T00:00`, TZ) : null;
}

export function files(fd: FormData, name: string): File[] {
  return fd.getAll(name).filter((v): v is File => typeof v === "object" && v !== null && "size" in v && (v as File).size > 0);
}
