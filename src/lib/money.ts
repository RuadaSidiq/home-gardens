/** Money helpers. Amounts are integers in minor units. */
export type Money = { amount: number; currency: string };

const MINOR: Record<string, number> = { GHS: 2, USD: 2, GBP: 2, EUR: 2, NGN: 2 };
const LOCALE: Record<string, string> = { GHS: "en-GH", USD: "en-US", GBP: "en-GB", EUR: "en-IE", NGN: "en-NG" };

export function minorUnits(currency: string) {
  return MINOR[currency] ?? 2;
}

export function toMinor(major: number | string, currency: string) {
  const n = typeof major === "string" ? Number(major.replace(/,/g, "")) : major;
  if (!Number.isFinite(n)) throw new Error("Invalid amount");
  return Math.round(n * 10 ** minorUnits(currency));
}

export function toMajor(minor: number, currency: string) {
  return minor / 10 ** minorUnits(currency);
}

export function formatMoney(minor: number, currency: string, opts: { compact?: boolean; noDecimals?: boolean } = {}) {
  const major = toMajor(minor, currency);
  const fmt = new Intl.NumberFormat(LOCALE[currency] ?? "en-US", {
    style: "currency",
    currency,
    currencyDisplay: currency === "GHS" ? "narrowSymbol" : "symbol",
    notation: opts.compact ? "compact" : "standard",
    minimumFractionDigits: opts.noDecimals || opts.compact ? 0 : minorUnits(currency),
    maximumFractionDigits: opts.noDecimals ? 0 : opts.compact ? 1 : minorUnits(currency),
  });
  return fmt.format(major);
}

/** Convert using a decimal rate (quote per 1 base). Rounds half away from zero. */
export function convert(minor: number, rate: number | string) {
  const r = typeof rate === "string" ? Number(rate) : rate;
  return Math.round(minor * r);
}

/** Basis-point percentage of an amount, rounded to nearest minor unit. */
export function bps(amount: number, rateBps: number) {
  return Math.round((amount * rateBps) / 10000);
}

export function percentOf(amount: number, percent: number) {
  return Math.round((amount * percent) / 100);
}
