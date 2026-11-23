"use client";
import { ActionForm, Checkbox, Input, Modal, Select, SubmitButton } from "@/components/ui/form";
import { saveCoupon } from "../_actions/commerce";

type C = { id: string; code: string; description: string | null; type: string; value: number; currency: string | null; scope: string; minSubtotal: number; maxUses: number | null; perUserLimit: number; startsAt: Date | null; endsAt: Date | null; active: boolean };

export function CouponModal({ c }: { c?: C }) {
  return (
    <Modal trigger={c ? "Edit" : "New coupon"} title={c ? `Edit ${c.code}` : "New coupon"} triggerVariant={c ? "ghost" : "primary"} wide>
      {(close) => (
        <ActionForm action={saveCoupon} onSuccess={close} className="grid gap-4 sm:grid-cols-3">
          {c && <input type="hidden" name="id" value={c.id} />}
          <Input label="Code" name="code" required defaultValue={c?.code} />
          <Select label="Type" name="type" defaultValue={c?.type ?? "percent"} options={[{ value: "percent", label: "Percentage" }, { value: "fixed", label: "Fixed amount" }]} />
          <Input label="Value (% or amount)" name="value" type="number" step="0.01" min={0} required defaultValue={c ? (c.type === "percent" ? c.value : c.value / 100) : ""} />
          <Select label="Currency (fixed)" name="currency" defaultValue={c?.currency ?? "GHS"} options={["GHS", "USD", "GBP", "EUR", "NGN"].map((x) => ({ value: x, label: x }))} />
          <Select label="Applies to" name="scope" defaultValue={c?.scope ?? "all"} options={[{ value: "all", label: "Everything" }, { value: "products", label: "Shop products" }, { value: "services", label: "Services" }, { value: "activities", label: "Activities" }]} />
          <Input label="Minimum spend" name="minSubtotal" type="number" step="0.01" min={0} defaultValue={c ? c.minSubtotal / 100 : 0} />
          <Input label="Total uses (blank = unlimited)" name="maxUses" type="number" min={1} defaultValue={c?.maxUses ?? ""} />
          <Input label="Uses per customer" name="perUserLimit" type="number" min={1} defaultValue={c?.perUserLimit ?? 1} />
          <Input label="Description" name="description" defaultValue={c?.description ?? ""} />
          <Input label="Starts" name="startsAt" type="date" defaultValue={c?.startsAt ? new Date(c.startsAt).toISOString().slice(0, 10) : ""} />
          <Input label="Ends" name="endsAt" type="date" defaultValue={c?.endsAt ? new Date(c.endsAt).toISOString().slice(0, 10) : ""} />
          <Checkbox name="active" label="Active" defaultChecked={c?.active ?? true} className="self-end" />
          <div className="sm:col-span-3"><SubmitButton>Save coupon</SubmitButton></div>
        </ActionForm>
      )}
    </Modal>
  );
}
