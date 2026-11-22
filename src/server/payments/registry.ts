import { paystack } from "./paystack";
import { stripe } from "./stripe";
import { hubtel } from "./hubtel";
import { paypal } from "./paypal";
import { manual } from "./manual";
import type { PaymentProvider } from "./types";

export const PROVIDERS: Record<string, PaymentProvider> = { paystack, hubtel, stripe, paypal, manual };

export function getProvider(key: string) {
  const p = PROVIDERS[key];
  if (!p) throw new Error(`Unknown payment provider ${key}`);
  return p;
}

/** Providers usable for a country + currency: enabled for the country, configured and supporting the currency. */
export function providersFor(countryProviders: string[], currency: string) {
  return countryProviders
    .map((k) => PROVIDERS[k])
    .filter((p): p is PaymentProvider => !!p && p.configured() && p.currencies.includes(currency));
}

export function providerStatus() {
  return Object.values(PROVIDERS).map((p) => ({ key: p.key, label: p.label, configured: p.configured(), currencies: p.currencies }));
}
