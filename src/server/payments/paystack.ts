import { createHmac, timingSafeEqual } from "node:crypto";
import { ProviderError, type PaymentProvider } from "./types";

const API = "https://api.paystack.co";
const key = () => process.env.PAYSTACK_SECRET_KEY ?? "";

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(API + path, {
    ...init,
    headers: { Authorization: `Bearer ${key()}`, "content-type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  const json = (await r.json().catch(() => ({}))) as { status?: boolean; message?: string; data?: unknown };
  if (!r.ok || json.status === false) throw new ProviderError(`Paystack: ${json.message ?? r.status}`);
  return json.data as T;
}

export const paystack: PaymentProvider = {
  key: "paystack",
  label: "Card or Mobile Money (Paystack)",
  description: "Visa, Mastercard, MTN MoMo, Telecel Cash, AirtelTigo Money",
  currencies: ["GHS", "NGN", "USD"],
  configured: () => !!key(),
  async initialize(i) {
    const data = await call<{ authorization_url: string; reference: string }>("/transaction/initialize", {
      method: "POST",
      body: JSON.stringify({
        email: i.email,
        amount: i.amount,
        currency: i.currency,
        reference: i.reference,
        callback_url: i.callbackUrl,
        metadata: { ...i.metadata, cancel_action: i.cancelUrl },
      }),
    });
    return { checkoutUrl: data.authorization_url, providerReference: data.reference };
  },
  async verify(ref) {
    const d = await call<{ status: string; amount: number; currency: string; fees: number | null; channel: string; id: number; gateway_response: string }>(
      `/transaction/verify/${encodeURIComponent(ref)}`,
    );
    return {
      status: d.status === "success" ? "succeeded" : d.status === "failed" || d.status === "abandoned" || d.status === "reversed" ? "failed" : "pending",
      amount: d.amount,
      currency: d.currency,
      fee: d.fees ?? 0,
      channel: d.channel,
      providerReference: String(d.id),
      failureReason: d.status === "success" ? undefined : d.gateway_response,
      raw: d,
    };
  },
  async refund(p) {
    const d = await call<{ status: string; id: number }>("/refund", {
      method: "POST",
      body: JSON.stringify({ transaction: p.reference, amount: p.amount }),
    });
    return { status: d.status === "processed" ? "succeeded" : "pending", providerReference: String(d.id) };
  },
};

/** Paystack signs webhooks with HMAC-SHA512 of the raw body using the secret key. */
export function verifyPaystackSignature(raw: string, signature: string | null) {
  if (!signature || !key()) return false;
  const expected = createHmac("sha512", key()).update(raw).digest("hex");
  return expected.length === signature.length && timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}
