/** Time-zone helpers built on Intl, no external dependency. */

function parts(date: Date, timeZone: string) {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
  });
  const o: Record<string, string> = {};
  for (const p of f.formatToParts(date)) o[p.type] = p.value;
  return o;
}

/** Offset of the zone from UTC at the given instant, in milliseconds. */
export function tzOffsetMs(date: Date, timeZone: string) {
  const p = parts(date, timeZone);
  const asUtc = Date.UTC(+p.year!, +p.month! - 1, +p.day!, +p.hour!, +p.minute!, +p.second!);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Convert a wall-clock date ("2026-03-01") and time ("09:30") in a zone to a UTC Date. */
export function zonedToUtc(dateStr: string, timeStr: string, timeZone: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = timeStr.split(":").map(Number);
  const guess = Date.UTC(y!, m! - 1, d!, hh!, mm!);
  let utc = guess - tzOffsetMs(new Date(guess), timeZone);
  // second pass handles DST transitions
  utc = guess - tzOffsetMs(new Date(utc), timeZone);
  return new Date(utc);
}

const WD: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Wall-clock info for an instant in a zone. */
export function zonedInfo(date: Date, timeZone: string) {
  const p = parts(date, timeZone);
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    time: `${p.hour}:${p.minute}`,
    weekday: WD[p.weekday!]!,
    minutes: +p.hour! * 60 + +p.minute!,
  };
}

export function timeToMinutes(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h! * 60 + m!;
}

export function minutesToTime(m: number) {
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function addDaysStr(dateStr: string, days: number) {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
