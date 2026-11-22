import { ProviderError, type PaymentProvider } from "./types";

const base = () => (process.env.PAYPAL_MODE === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com");

async function accessToken() {
  const r = await fetch(`${base()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString("base64"),
      "content-type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });
  if (!r.ok) throw new ProviderError(`PayPal auth failed (${r.status})`);
  return ((await r.json()) as { access_token: string }).access_token;
}

async function call<T>(path: string, method = "GET", body?: unknown, idem?: string): Promise<T> {
  const r = await fetch(base() + path, {
    method,
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      "content-type": "application/json",
      ...(idem ? { "PayPal-Request-Id": idem } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const json = (await r.json().catch(() => ({}))) as T & { message?: string };
  if (!r.ok) throw new ProviderError(`PayPal: ${json.message ?? r.status}`);
  return json;
}

type Order = {
  id: string;
  status: string;
  links: { rel: string; href: string }[];
  purchase_units?: { payments?: { captures?: { id: string; status: string; amount: { value: string; currency_code: string } }[] } }[];
};

export const paypal: PaymentProvider = {
  key: "paypal",
  label: "PayPal",
  description: "Pay with your PayPal balance or card",
  currencies: ["USD", "GBP", "EUR"],
  configured: () => !!(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET),
  async initialize(i) {
    const o = await call<Order>(
      "/v2/checkout/orders",
      "POST",
      {
        intent: "CAPTURE",
        purchase_units: [{ reference_id: i.reference, custom_id: i.reference, description: i.description.slice(0, 127), amount: { currency_code: i.currency, value: (i.amount / 100).toFixed(2) } }],
        application_context: { return_url: i.callbackUrl, cancel_url: i.cancelUrl, user_action: "PAY_NOW", shipping_preference: "NO_SHIPPING" },
      },
      `init-${i.reference}`,
    );
    const approve = o.links.find((l) => l.rel === "approve" || l.rel === "payer-action");
    if (!approve) throw new ProviderError("PayPal did not return an approval link");
    return { checkoutUrl: approve.href, providerReference: o.id };
  },
  async verify(ref, providerRef) {
    if (!providerRef) throw new ProviderError("PayPal order id missing");
    let o = await call<Order>(`/v2/checkout/orders/${providerRef}`);
    if (o.status === "APPROVED") o = await call<Order>(`/v2/checkout/orders/${providerRef}/capture`, "POST", {}, `capture-${ref}`);
    const cap = o.purchase_units?.[0]?.payments?.captures?.[0];
    return {
      status: o.status === "COMPLETED" && cap?.status === "COMPLETED" ? "succeeded" : o.status === "VOIDED" ? "failed" : "pending",
      amount: cap ? Math.round(Number(cap.amount.value) * 100) : 0,
      currency: cap?.amount.currency_code ?? "",
      channel: "paypal",
      providerReference: o.id,
      raw: o,
    };
  },
  async refund(p) {
    const raw = p.raw as Order | null;
    const capId = raw?.purchase_units?.[0]?.payments?.captures?.[0]?.id;
    if (!capId) throw new ProviderError("PayPal capture id missing");
    const r = await call<{ id: string; status: string }>(
      `/v2/payments/captures/${capId}/refund`,
      "POST",
      { amount: { value: (p.amount / 100).toFixed(2), currency_code: p.currency } },
      `refund-${p.reference}-${p.amount}-${Date.now()}`,
    );
    return { status: r.status === "COMPLETED" ? "succeeded" : "pending", providerReference: r.id };
  },
};
