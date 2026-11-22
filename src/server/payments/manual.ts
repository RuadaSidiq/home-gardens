import type { PaymentProvider } from "./types";

/**
 * Offline payment (bank transfer or Mobile Money to the company number).
 * Nothing is marked as paid automatically: a finance staff member verifies the
 * transfer and confirms it in /admin/payments. Enabled via the MANUAL_PAYMENTS_ENABLED flag.
 */
export const manual: PaymentProvider = {
  key: "manual",
  label: "Bank transfer / MoMo transfer",
  description: "Transfer the amount and our finance team confirms it, usually within a few working hours",
  currencies: ["GHS", "USD", "GBP", "EUR", "NGN"],
  configured: () => process.env.MANUAL_PAYMENTS_ENABLED !== "false",
  async initialize(i) {
    return { checkoutUrl: `/pay/manual/${encodeURIComponent(i.reference)}` };
  },
  async verify(_ref) {
    return { status: "pending", amount: 0, currency: "", raw: null };
  },
  async refund() {
    return { status: "pending", failureReason: "Send the refund manually, then record the transfer reference." };
  },
};
