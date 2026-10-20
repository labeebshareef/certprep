// Study-day arithmetic. A "local date" is the calendar date in the user's time zone after subtracting the
// rollover hour, so 02:00 on the 21st with a 04:00 rollover still counts as the 20th.
import { HOUR, DAY } from "./utils";

export type DayClock = { timezone: string; rolloverHour: number };

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(timezone: string) {
  let f = fmtCache.get(timezone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    fmtCache.set(timezone, f);
  }
  return f;
}

function parts(ts: Date, timezone: string) {
  const p = Object.fromEntries(fmt(timezone).formatToParts(ts).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, min: +p.minute, s: +p.second };
}

/** Offset of `timezone` from UTC at instant `ts`, in ms (Asia/Dubai → +4h). */
export function tzOffset(ts: Date, timezone: string): number {
  const p = parts(ts, timezone);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s);
  return asUtc - Math.floor(ts.getTime() / 1000) * 1000;
}

/** YYYY-MM-DD study date for an instant. */
export function localDate(ts: Date, clock: DayClock): string {
  const shifted = new Date(ts.getTime() - clock.rolloverHour * HOUR);
  const p = parts(shifted, clock.timezone);
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

/** The instant the given study date starts (its rollover hour, local time). */
export function startOfLocalDate(date: string, clock: DayClock): Date {
  const [y, m, d] = date.split("-").map(Number);
  const wall = Date.UTC(y, m - 1, d, clock.rolloverHour);
  // Resolve wall time → instant using the offset at (approximately) that moment.
  const guess = new Date(wall - tzOffset(new Date(wall), clock.timezone));
  return new Date(wall - tzOffset(guess, clock.timezone));
}

/** End of the current study day (exclusive), i.e. the start of tomorrow's. */
export function endOfLocalDay(now: Date, clock: DayClock): Date {
  return startOfLocalDate(addDays(localDate(now, clock), 1), clock);
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d) + n * DAY);
  return t.toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / DAY);
}
