"use client";
import { ActionForm, Checkbox, Input, Modal, Select, SubmitButton } from "@/components/ui/form";
import { saveAddress } from "../actions";

type A = { id?: string; label: string; recipient: string; phone: string; line1: string; line2: string | null; cityId: number | null; digitalAddress: string | null; postalCode: string | null; isDefault: boolean };

export function AddressModal({ address, cities, trigger }: { address?: A; cities: { id: number; name: string; country: string }[]; trigger: string }) {
  return (
    <Modal trigger={trigger} title={address ? "Edit address" : "Add address"} triggerVariant={address ? "ghost" : "primary"}>
      {(close) => (
        <ActionForm action={saveAddress} onSuccess={close} className="grid gap-4 sm:grid-cols-2">
          {address?.id && <input type="hidden" name="id" value={address.id} />}
          <Input label="Label" name="label" required defaultValue={address?.label ?? "Home"} />
          <Input label="Recipient" name="recipient" required defaultValue={address?.recipient} />
          <Input label="Phone" name="phone" type="tel" required defaultValue={address?.phone} wrapClassName="sm:col-span-2" />
          <Input label="Street address" name="line1" required defaultValue={address?.line1} wrapClassName="sm:col-span-2" />
          <Input label="Landmark / apartment" name="line2" defaultValue={address?.line2 ?? ""} />
          <Select label="City / area" name="cityId" required defaultValue={address?.cityId ?? ""} placeholder="Select" options={cities.map((c) => ({ value: c.id, label: `${c.name} (${c.country})` }))} />
          <Input label="GhanaPost GPS" name="digitalAddress" defaultValue={address?.digitalAddress ?? ""} />
          <Input label="Postal code" name="postalCode" defaultValue={address?.postalCode ?? ""} />
          <Checkbox name="isDefault" label="Use as my default address" defaultChecked={address?.isDefault} className="sm:col-span-2" />
          <div className="sm:col-span-2"><SubmitButton>Save address</SubmitButton></div>
        </ActionForm>
      )}
    </Modal>
  );
}
