import { ProviderError, type PaymentProvider } from "./types";

const auth = () =>
  "Basic " + Buffer.from(`${process.env.HUBTEL_CLIENT_ID ?? ""}:${process.env.HUBTEL_CLIENT_SECRET ?? ""}`).toString("base64");

export const hubtel: PaymentProvider = {
  key: "hubtel",
  label: "Mobile Money (Hubtel)",
  description: "MTN MoMo, Telecel Cash, AirtelTigo Money, cards and bank in Ghana",
  currencies: ["GHS"],
  configured: () => !!(process.env.HUBTEL_CLIENT_ID && process.env.HUBTEL_CLIENT_SECRET && process.env.HUBTEL_MERCHANT_ACCOUNT),
  async initialize(i) {
    const r = await fetch("https://payproxyapi.hubtel.com/items/initiate", {
      method: "POST",
      headers: { Authorization: auth(), "content-type": "application/json" },
      body: JSON.stringify({
        totalAmount: i.amount / 100,
        description: i.description.slice(0, 100),
        callbackUrl: `${process.env.APP_URL}/api/webhooks/hubtel`,
        returnUrl: i.callbackUrl,
        cancellationUrl: i.cancelUrl,
        merchantAccountNumber: process.env.HUBTEL_MERCHANT_ACCOUNT,
        clientReference: i.reference,
      }),
      cache: "no-store",
    });
    const json = (await r.json().catch(() => ({}))) as { responseCode?: string; data?: { checkoutUrl: string; checkoutId: string }; message?: string };
    if (!r.ok || json.responseCode !== "0000" || !json.data) throw new ProviderError(`Hubtel: ${json.message ?? r.status}`);
    return { checkoutUrl: json.data.checkoutUrl, providerReference: json.data.checkoutId };
  },
  async verify(ref) {
    const url = `https://api-txnstatus.hubtel.com/transactions/${process.env.HUBTEL_MERCHANT_ACCOUNT}/status?clientReference=${encodeURIComponent(ref)}`;
    const r = await fetch(url, { headers: { Authorization: auth() }, cache: "no-store" });
    const json = (await r.json().catch(() => ({}))) as { data?: { status: string; amount: number; charges?: number; paymentMethod?: string; transactionId?: string } };
    if (!r.ok || !json.data) throw new ProviderError(`Hubtel status check failed (${r.status})`);
    const d = json.data;
    const s = d.status.toLowerCase();
    return {
      status: s === "paid" ? "succeeded" : s === "unpaid" || s === "pending" ? "pending" : "failed",
      amount: Math.round(d.amount * 100),
      currency: "GHS",
      fee: Math.round((d.charges ?? 0) * 100),
      channel: d.paymentMethod,
      providerReference: d.transactionId,
      raw: d,
    };
  },
  async refund() {
    // Hubtel online checkout refunds are processed from the Hubtel merchant dashboard.
    return { status: "pending", failureReason: "Complete this refund in the Hubtel merchant dashboard, then mark it as processed." };
  },
};
