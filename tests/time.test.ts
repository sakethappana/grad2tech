import { describe, expect, it } from "vitest";
import { formatDateTime, startOfZonedDay, utcToZonedLocal, zonedLocalToUtc } from "@/lib/time";

describe("timezones", () => {
  it("interprets form input as Asia/Kolkata and stores UTC", () => {
    expect(zonedLocalToUtc("2026-10-22T18:30", "Asia/Kolkata")?.toISOString()).toBe("2026-10-22T13:00:00.000Z");
    expect(utcToZonedLocal(new Date("2026-10-22T13:00:00Z"), "Asia/Kolkata")).toBe("2026-10-22T18:30");
    expect(zonedLocalToUtc("not a date")).toBeNull();
  });

  it("displays with a timezone label", () => {
    expect(formatDateTime(new Date("2026-10-22T13:00:00Z"), "Asia/Kolkata")).toMatch(/6:30\s?pm IST$/i);
  });

  it("computes the start of the day in IST", () => {
    expect(startOfZonedDay(new Date("2026-10-22T20:00:00Z"), "Asia/Kolkata").toISOString()).toBe("2026-10-22T18:30:00.000Z");
  });

  it("handles zones with daylight saving", () => {
    expect(zonedLocalToUtc("2026-07-01T12:00", "Europe/London")?.toISOString()).toBe("2026-07-01T11:00:00.000Z");
  });
});
