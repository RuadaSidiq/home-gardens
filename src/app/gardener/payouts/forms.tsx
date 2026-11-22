"use client";
import { useState } from "react";
import { ActionForm, Input, Select, SubmitButton } from "@/components/ui/form";
import { requestMyPayout, savePayoutMethod } from "../actions";

export function PayoutRequest({ available, currency, minimum }: { available: number; currency: string; minimum: number }) {
  return (
    <ActionForm action={requestMyPayout} resetOnSuccess className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="currency" value={currency} />
      <Input label={`Amount (${currency})`} name="amount" type="number" step="0.01" min={minimum / 100} max={available / 100} defaultValue={(available / 100).toFixed(2)} required wrapClassName="w-48" />
      <SubmitButton disabled={available < minimum}>Request payout</SubmitButton>
    </ActionForm>
  );
}

export function PayoutMethodForm() {
  const [m, setM] = useState("momo");
  return (
    <ActionForm action={savePayoutMethod} resetOnSuccess className="grid gap-4 sm:grid-cols-2">
      <Select label="Method" name="method" value={m} onChange={(e) => setM(e.target.value)} options={[{ value: "momo", label: "Mobile Money" }, { value: "bank", label: "Bank account" }]} />
      <Input label={m === "momo" ? "Network" : "Bank"} name="provider" required />
      <Input label="Account name" name="accountName" required />
      <Input label={m === "momo" ? "MoMo number" : "Account number"} name="accountNumber" required />
      <div className="sm:col-span-2"><SubmitButton variant="outline">Update payout details</SubmitButton></div>
    </ActionForm>
  );
}
