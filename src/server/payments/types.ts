export type InitInput = {
  reference: string;
  amount: number; // minor units
  currency: string;
  email: string;
  description: string;
  callbackUrl: string; // where the customer returns; we verify server-side there
  cancelUrl: string;
  metadata: Record<string, string>;
};

export type InitResult = { checkoutUrl: string; providerReference?: string };

export type VerifyResult = {
  status: "succeeded" | "pending" | "failed";
  amount: number; // minor units actually paid
  currency: string;
  fee?: number;
  channel?: string;
  providerReference?: string;
  failureReason?: string;
  raw: unknown;
};

export type RefundResult = { status: "succeeded" | "pending" | "failed"; providerReference?: string; failureReason?: string };

export interface PaymentProvider {
  key: string;
  label: string;
  description: string;
  currencies: string[];
  configured(): boolean;
  initialize(i: InitInput): Promise<InitResult>;
  /** `ref` is our reference; `providerRef` the provider's id when one exists. */
  verify(ref: string, providerRef?: string | null): Promise<VerifyResult>;
  refund(p: { reference: string; providerReference: string | null; amount: number; currency: string; raw: unknown }): Promise<RefundResult>;
}

export class ProviderError extends Error {}
