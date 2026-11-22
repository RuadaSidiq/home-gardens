/**
 * Pure pricing functions (no I/O) so they can be unit tested.
 */
import { bps, percentOf } from "@/lib/money";

export type PricingModel = "fixed" | "starting" | "hourly" | "per_sqm" | "quote" | "inspection";

export type ServicePriceInput = {
  model: PricingModel;
  unitPrice: number; // minor units, already in target currency
  minimumCharge: number;
  durationMinutes: number;
  gardenSizeSqm?: number | null;
  hours?: number | null;
};

export type ServicePriceResult =
  | { kind: "priced"; subtotal: number; isFinal: boolean; breakdown: string }
  | { kind: "quote"; reason: string };

export function priceService(i: ServicePriceInput): ServicePriceResult {
  switch (i.model) {
    case "fixed":
      return { kind: "priced", subtotal: i.unitPrice, isFinal: true, breakdown: "Fixed price" };
    case "starting":
      return { kind: "priced", subtotal: Math.max(i.unitPrice, i.minimumCharge), isFinal: false, breakdown: "Starting price – the gardener may adjust after seeing the site" };
    case "hourly": {
      const hours = Math.max(i.hours ?? i.durationMinutes / 60, 1);
      const sub = Math.round(i.unitPrice * hours);
      return { kind: "priced", subtotal: Math.max(sub, i.minimumCharge), isFinal: true, breakdown: `${hours} h × hourly rate` };
    }
    case "per_sqm": {
      if (!i.gardenSizeSqm || i.gardenSizeSqm <= 0) return { kind: "quote", reason: "Garden size is needed to price this service." };
      const sub = i.unitPrice * i.gardenSizeSqm;
      return { kind: "priced", subtotal: Math.max(sub, i.minimumCharge), isFinal: true, breakdown: `${i.gardenSizeSqm} m² × rate per m²` };
    }
    case "quote":
      return { kind: "quote", reason: "This service is priced after we review your request." };
    case "inspection":
      return { kind: "quote", reason: "A site inspection is required before we can price this work." };
  }
}

export type TaxRule = { rateBps: number; inclusive: boolean; name: string };

/** Applies taxes to a (post-discount) amount. Inclusive taxes are extracted, exclusive ones added. */
export function applyTaxes(amount: number, rules: TaxRule[]) {
  let added = 0;
  let included = 0;
  const lines: { name: string; amount: number }[] = [];
  const inclusiveBps = rules.filter((r) => r.inclusive).reduce((s, r) => s + r.rateBps, 0);
  const net = inclusiveBps ? Math.round((amount * 10000) / (10000 + inclusiveBps)) : amount;
  for (const r of rules) {
    const t = bps(net, r.rateBps);
    if (r.inclusive) included += t;
    else added += t;
    lines.push({ name: r.name, amount: t });
  }
  return { tax: added + included, added, included, total: amount + added, lines };
}

export type CouponInput = { type: "percent" | "fixed"; value: number; minSubtotal: number };

export function couponDiscount(subtotal: number, c: CouponInput | null) {
  if (!c || subtotal < c.minSubtotal) return 0;
  const d = c.type === "percent" ? percentOf(subtotal, Math.min(c.value, 100)) : c.value;
  return Math.min(d, subtotal);
}

export function depositFor(total: number, depositPercent: number) {
  if (depositPercent >= 100 || depositPercent <= 0) return total;
  return percentOf(total, depositPercent);
}

/** Refund owed when a customer cancels. Free before the cutoff, a percentage fee after. */
export function cancellationRefund(opts: {
  amountPaid: number;
  total: number;
  hoursBeforeStart: number;
  freeCancellationHours: number;
  lateFeePercent: number;
  cancelledByCustomer: boolean;
}) {
  if (!opts.cancelledByCustomer || opts.hoursBeforeStart >= opts.freeCancellationHours) return { refund: opts.amountPaid, fee: 0 };
  const fee = Math.min(percentOf(opts.total, opts.lateFeePercent), opts.amountPaid);
  return { refund: opts.amountPaid - fee, fee };
}

export function commissionSplit(gross: number, rateBps: number) {
  const commission = bps(gross, rateBps);
  return { commission, gardener: gross - commission };
}

/** Shipping price for a delivery method. */
export function shippingPrice(m: { type: "flat" | "pickup" | "weight"; price: number; pricePerKg: number; freeOver: number | null }, subtotal: number, weightGrams: number) {
  if (m.type === "pickup") return 0;
  if (m.freeOver != null && subtotal >= m.freeOver) return 0;
  if (m.type === "weight") return m.price + Math.ceil(weightGrams / 1000) * m.pricePerKg;
  return m.price;
}
