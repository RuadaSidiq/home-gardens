import { createHmac, timingSafeEqual } from "node:crypto";
import { ProviderError, type PaymentProvider } from "./types";

const key = () => process.env.STRIPE_SECRET_KEY ?? "";

function form(obj: Record<string, string | number | undefined>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) p.append(k, String(v));
  return p;
}

async function call<T>(path: string, method = "GET", body?: URLSearchParams, idem?: string): Promise<T> {
  const r = await fetch("https://api.stripe.com/v1" + path, {
    method,
    headers: {
      Authorization: `Bearer ${key()}`,
      "content-type": "application/x-www-form-urlencoded",
      ...(idem ? { "Idempotency-Key": idem } : {}),
    },
    body,
    cache: "no-store",
  });
  const json = (await r.json().catch(() => ({}))) as { error?: { message: string } };
  if (!r.ok) throw new ProviderError(`Stripe: ${json.error?.message ?? r.status}`);
  return json as T;
}

type Session = { id: string; url: string; payment_status: string; status: string; amount_total: number; currency: string; payment_intent: string | null };

export const stripe: PaymentProvider = {
  key: "stripe",
  label: "Card (Stripe)",
  description: "International Visa, Mastercard, Amex, Apple Pay and Google Pay",
  currencies: ["USD", "GBP", "EUR", "GHS", "NGN"],
  configured: () => !!key(),
  async initialize(i) {
    const s = await call<Session>(
      "/checkout/sessions",
      "POST",
      form({
        mode: "payment",
        customer_email: i.email,
        client_reference_id: i.reference,
        success_url: `${i.callbackUrl}${i.callbackUrl.includes("?") ? "&" : "?"}session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: i.cancelUrl,
        "line_items[0][quantity]": 1,
        "line_items[0][price_data][currency]": i.currency.toLowerCase(),
        "line_items[0][price_data][unit_amount]": i.amount,
        "line_items[0][price_data][product_data][name]": i.description,
        "metadata[reference]": i.reference,
        "payment_intent_data[metadata][reference]": i.reference,
      }),
      `init-${i.reference}`,
    );
    return { checkoutUrl: s.url, providerReference: s.id };
  },
  async verify(_ref, providerRef) {
    if (!providerRef) throw new ProviderError("Stripe session id missing");
    const s = await call<Session>(`/checkout/sessions/${encodeURIComponent(providerRef)}`);
    return {
      status: s.payment_status === "paid" ? "succeeded" : s.status === "expired" ? "failed" : "pending",
      amount: s.amount_total,
      currency: s.currency.toUpperCase(),
      channel: "card",
      providerReference: s.id,
      raw: s,
    };
  },
  async refund(p) {
    const raw = p.raw as Session | null;
    if (!raw?.payment_intent) throw new ProviderError("Stripe payment intent missing");
    const r = await call<{ id: string; status: string }>(
      "/refunds",
      "POST",
      form({ payment_intent: raw.payment_intent, amount: p.amount }),
      `refund-${p.reference}-${p.amount}-${Date.now()}`,
    );
    return { status: r.status === "succeeded" ? "succeeded" : r.status === "failed" ? "failed" : "pending", providerReference: r.id };
  },
};

/** Validates the Stripe-Signature header (v1 scheme, 5 minute tolerance). */
export function verifyStripeSignature(raw: string, header: string | null, now = Date.now()) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!header || !secret) return false;
  const items = Object.fromEntries(header.split(",").map((kv) => kv.split("=") as [string, string]));
  const t = Number(items.t);
  if (!t || Math.abs(now / 1000 - t) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex");
  const sigs = header.split(",").filter((s) => s.startsWith("v1=")).map((s) => s.slice(3));
  return sigs.some((s) => s.length === expected.length && timingSafeEqual(Buffer.from(s), Buffer.from(expected)));
}
