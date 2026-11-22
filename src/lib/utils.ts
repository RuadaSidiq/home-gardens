import clsx, { type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatDate(d: Date | string | null | undefined, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }, timeZone = "Africa/Accra") {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-GB", { ...opts, timeZone }).format(new Date(d));
}

export function formatDateTime(d: Date | string | null | undefined, timeZone = "Africa/Accra") {
  return formatDate(d, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }, timeZone);
}

export function formatTime(d: Date | string, timeZone = "Africa/Accra") {
  return formatDate(d, { hour: "2-digit", minute: "2-digit" }, timeZone);
}

export function relativeTime(d: Date | string) {
  const diff = (Date.now() - new Date(d).getTime()) / 1000;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (abs < 60) return "just now";
  if (abs < 3600) return rtf.format(-Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(-Math.round(diff / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(-Math.round(diff / 86400), "day");
  return formatDate(d);
}

export function titleCase(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
}

export function pluralize(n: number, word: string, plural = word + "s") {
  return `${n} ${n === 1 ? word : plural}`;
}
