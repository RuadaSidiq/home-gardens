import { describe, expect, it } from "vitest";
import { applyTaxes, cancellationRefund, commissionSplit, couponDiscount, depositFor, priceService, shippingPrice } from "@/server/pricing";
import { matchScore } from "@/server/bookings/availability";
import { formatMoney, toMinor } from "@/lib/money";
import { verifyTotp, totp, generateTotpSecret } from "@/server/auth/totp";
import { zonedToUtc, zonedInfo } from "@/lib/time";
import { encrypt, decrypt } from "@/server/crypto";
import { sniffMime } from "@/server/storage";

describe("service pricing", () => {
  const base = { unitPrice: 10000, minimumCharge: 0, durationMinutes: 120 };
  it("fixed price is final", () => expect(priceService({ ...base, model: "fixed" })).toEqual({ kind: "priced", subtotal: 10000, isFinal: true, breakdown: "Fixed price" }));
  it("starting price is not final", () => expect(priceService({ ...base, model: "starting" })).toMatchObject({ subtotal: 10000, isFinal: false }));
  it("hourly uses hours or duration, at least one hour", () => {
    expect(priceService({ ...base, model: "hourly", hours: 3 })).toMatchObject({ subtotal: 30000 });
    expect(priceService({ ...base, model: "hourly" })).toMatchObject({ subtotal: 20000 });
    expect(priceService({ ...base, model: "hourly", hours: 0.5 })).toMatchObject({ subtotal: 10000 });
  });
  it("per m² respects minimum charge and needs a size", () => {
    expect(priceService({ ...base, unitPrice: 150, minimumCharge: 18000, model: "per_sqm", gardenSizeSqm: 50 })).toMatchObject({ subtotal: 18000 });
    expect(priceService({ ...base, unitPrice: 150, minimumCharge: 18000, model: "per_sqm", gardenSizeSqm: 400 })).toMatchObject({ subtotal: 60000 });
    expect(priceService({ ...base, model: "per_sqm" }).kind).toBe("quote");
  });
  it("quote and inspection models require a quote", () => {
    expect(priceService({ ...base, model: "quote" }).kind).toBe("quote");
    expect(priceService({ ...base, model: "inspection" }).kind).toBe("quote");
  });
});

describe("taxes, discounts, deposits", () => {
  it("adds exclusive taxes", () => {
    const t = applyTaxes(10000, [{ name: "VAT", rateBps: 1500, inclusive: false }, { name: "NHIL", rateBps: 250, inclusive: false }]);
    expect(t).toMatchObject({ tax: 1750, total: 11750 });
  });
  it("extracts inclusive taxes without changing the total", () => {
    const t = applyTaxes(12000, [{ name: "VAT", rateBps: 2000, inclusive: true }]);
    expect(t).toMatchObject({ tax: 2000, total: 12000 });
  });
  it("coupons respect minimum and never exceed subtotal", () => {
    expect(couponDiscount(10000, { type: "percent", value: 10, minSubtotal: 0 })).toBe(1000);
    expect(couponDiscount(10000, { type: "fixed", value: 50000, minSubtotal: 0 })).toBe(10000);
    expect(couponDiscount(10000, { type: "fixed", value: 5000, minSubtotal: 20000 })).toBe(0);
  });
  it("deposit rounds and handles 100%", () => {
    expect(depositFor(10001, 30)).toBe(3000);
    expect(depositFor(10000, 100)).toBe(10000);
  });
});

describe("cancellation and commission", () => {
  it("free cancellation before the cutoff", () => {
    expect(cancellationRefund({ amountPaid: 5000, total: 10000, hoursBeforeStart: 30, freeCancellationHours: 24, lateFeePercent: 20, cancelledByCustomer: true })).toEqual({ refund: 5000, fee: 0 });
  });
  it("late fee is a percentage of total capped at amount paid", () => {
    expect(cancellationRefund({ amountPaid: 10000, total: 10000, hoursBeforeStart: 2, freeCancellationHours: 24, lateFeePercent: 20, cancelledByCustomer: true })).toEqual({ refund: 8000, fee: 2000 });
    expect(cancellationRefund({ amountPaid: 1000, total: 10000, hoursBeforeStart: 2, freeCancellationHours: 24, lateFeePercent: 20, cancelledByCustomer: true })).toEqual({ refund: 0, fee: 1000 });
  });
  it("staff cancellations always refund in full", () => {
    expect(cancellationRefund({ amountPaid: 10000, total: 10000, hoursBeforeStart: 1, freeCancellationHours: 24, lateFeePercent: 20, cancelledByCustomer: false }).refund).toBe(10000);
  });
  it("commission split adds up", () => {
    const s = commissionSplit(33333, 1500);
    expect(s.commission + s.gardener).toBe(33333);
    expect(s.commission).toBe(5000);
  });
});

describe("shipping", () => {
  it("free over threshold, pickup free, weight based", () => {
    expect(shippingPrice({ type: "flat", price: 3500, pricePerKg: 0, freeOver: 100000 }, 120000, 0)).toBe(0);
    expect(shippingPrice({ type: "pickup", price: 3500, pricePerKg: 0, freeOver: null }, 100, 0)).toBe(0);
    expect(shippingPrice({ type: "weight", price: 6000, pricePerKg: 600, freeOver: null }, 100, 2500)).toBe(7800);
  });
});

describe("matching score", () => {
  it("prefers better rated, experienced, less busy gardeners", () => {
    const a = matchScore({ rating: 4.9, ratingCount: 40, years: 8, weekLoad: 1, verified: true, type: "independent" });
    const b = matchScore({ rating: 4.0, ratingCount: 3, years: 1, weekLoad: 8, verified: false, type: "independent" });
    expect(a).toBeGreaterThan(b);
  });
});

describe("utilities", () => {
  it("money formatting and parsing", () => {
    expect(toMinor("1,250.50", "GHS")).toBe(125050);
    expect(formatMoney(125050, "USD")).toBe("$1,250.50");
  });
  it("TOTP round trip", () => {
    const s = generateTotpSecret();
    expect(verifyTotp(s, totp(s))).toBe(true);
    expect(verifyTotp(s, "000000") && totp(s) !== "000000").toBe(false);
  });
  it("time zone conversion", () => {
    const d = zonedToUtc("2026-06-15", "09:30", "Europe/London");
    expect(d.toISOString()).toBe("2026-06-15T08:30:00.000Z");
    expect(zonedInfo(d, "Europe/London")).toMatchObject({ time: "09:30", weekday: 1 });
    expect(zonedToUtc("2026-06-15", "09:30", "Africa/Accra").toISOString()).toBe("2026-06-15T09:30:00.000Z");
  });
  it("encryption round trip", () => expect(decrypt(encrypt("0244123456"))).toBe("0244123456"));
  it("file sniffing rejects disguised files", () => {
    expect(sniffMime(Buffer.from("%PDF-1.7 ..."))).toBe("application/pdf");
    expect(sniffMime(Buffer.from("<script>alert(1)</script>"))).toBeNull();
  });
});
