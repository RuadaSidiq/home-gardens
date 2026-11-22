"use client";
import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { payNow } from "@/app/account/actions";

type Provider = { key: string; label: string; description: string };

export function PaymentPanel({ purpose, subjectId, currency, providers, full, deposit, balance }: { purpose: "booking" | "order" | "activity"; subjectId: string; currency: string; providers: Provider[]; full: number; deposit?: number; balance?: boolean }) {
  const [kind, setKind] = useState<"deposit" | "full">(deposit && deposit < full ? "deposit" : "full");
  const [provider, setProvider] = useState(providers[0]?.key ?? "");
  if (!providers.length) return <p className="rounded-md bg-amber-400/10 p-3 text-sm text-sand-800">No payment method is configured for {currency} yet. Please contact support to complete payment.</p>;
  return (
    <ActionForm action={payNow} refresh={false} className="space-y-4">
      <input type="hidden" name="purpose" value={purpose} />
      <input type="hidden" name="subjectId" value={subjectId} />
      <input type="hidden" name="kind" value={balance ? "balance" : kind} />
      <input type="hidden" name="provider" value={provider} />
      {!balance && deposit != null && deposit > 0 && deposit < full && (
        <div className="grid gap-2 sm:grid-cols-2">
          {(["deposit", "full"] as const).map((k) => (
            <label key={k} className={cn("cursor-pointer rounded-md border p-3", kind === k ? "border-forest-600 bg-forest-50" : "border-sand-300")}>
              <input type="radio" className="sr-only" checked={kind === k} onChange={() => setKind(k)} />
              <span className="block text-sm text-ink-muted">{k === "deposit" ? "Pay deposit now" : "Pay in full"}</span>
              <span className="text-lg font-bold">{formatMoney(k === "deposit" ? deposit : full, currency)}</span>
            </label>
          ))}
        </div>
      )}
      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium">Payment method</legend>
        {providers.map((p) => (
          <label key={p.key} className={cn("flex cursor-pointer gap-3 rounded-md border p-3", provider === p.key ? "border-forest-600 bg-forest-50" : "border-sand-300")}>
            <input type="radio" checked={provider === p.key} onChange={() => setProvider(p.key)} className="mt-1 accent-forest-600" />
            <span><span className="block text-sm font-semibold">{p.label}</span><span className="text-xs text-ink-muted">{p.description}</span></span>
          </label>
        ))}
      </fieldset>
      <SubmitButton size="lg" className="w-full" pendingLabel="Connecting…">Pay {formatMoney(balance ? full : kind === "deposit" && deposit ? deposit : full, currency)}</SubmitButton>
    </ActionForm>
  );
}
