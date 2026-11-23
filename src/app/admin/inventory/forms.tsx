"use client";
import { ActionForm, Checkbox, Input, Modal, Select, SubmitButton } from "@/components/ui/form";
import { adjustInventory, saveWarehouse, transferStock } from "../_actions/catalog";

export function AdjustStock({ variantId, label, warehouses }: { variantId: string; label: string; warehouses: { id: number; name: string; onHand: number }[] }) {
  return (
    <Modal trigger="Adjust" title={`Adjust stock – ${label}`}>
      {(close) => (
        <div className="space-y-6">
          <ActionForm action={adjustInventory} onSuccess={close} className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="variantId" value={variantId} />
            <Select label="Warehouse" name="warehouseId" options={warehouses.map((w) => ({ value: w.id, label: `${w.name} (${w.onHand} on hand)` }))} />
            <Select label="Change" name="mode" options={[{ value: "add", label: "Add stock" }, { value: "remove", label: "Remove stock" }, { value: "set", label: "Set count to" }]} />
            <Input label="Quantity" name="quantity" type="number" min={0} required />
            <Select label="Reason" name="reason" options={[{ value: "restock", label: "Restock / delivery" }, { value: "adjustment", label: "Stock count correction" }, { value: "damage", label: "Damaged / expired" }, { value: "return", label: "Customer return" }]} />
            <Input label="Note" name="note" wrapClassName="sm:col-span-2" />
            <div className="sm:col-span-2"><SubmitButton>Save adjustment</SubmitButton></div>
          </ActionForm>
          {warehouses.length > 1 && (
            <ActionForm action={transferStock} onSuccess={close} className="grid gap-3 border-t border-sand-200 pt-4 sm:grid-cols-3">
              <input type="hidden" name="variantId" value={variantId} />
              <Select label="From" name="fromId" options={warehouses.map((w) => ({ value: w.id, label: w.name }))} />
              <Select label="To" name="toId" defaultValue={warehouses[1]?.id} options={warehouses.map((w) => ({ value: w.id, label: w.name }))} />
              <Input label="Quantity" name="quantity" type="number" min={1} required />
              <div className="sm:col-span-3"><SubmitButton variant="outline">Transfer</SubmitButton></div>
            </ActionForm>
          )}
        </div>
      )}
    </Modal>
  );
}

export function WarehouseForm({ w, countries }: { w?: { id: number; code: string; name: string; address: string | null; countryCode: string; active: boolean }; countries: string[] }) {
  const cls = "h-9 rounded-md border border-sand-300 px-2 text-sm";
  return (
    <ActionForm action={saveWarehouse} resetOnSuccess={!w} className="flex flex-wrap items-center gap-2">
      {w && <input type="hidden" name="id" value={w.id} />}
      <input name="code" required defaultValue={w?.code} placeholder="Code" aria-label="Code" className={`${cls} w-24`} />
      <input name="name" required defaultValue={w?.name} placeholder="Name" aria-label="Name" className={`${cls} w-56`} />
      <input name="address" defaultValue={w?.address ?? ""} placeholder="Address" aria-label="Address" className={`${cls} flex-1`} />
      <select name="countryCode" defaultValue={w?.countryCode ?? "GH"} aria-label="Country" className={cls}>{countries.map((c) => <option key={c}>{c}</option>)}</select>
      <Checkbox name="active" label="Active" defaultChecked={w?.active ?? true} />
      <SubmitButton size="sm" variant="outline">{w ? "Save" : "Add"}</SubmitButton>
    </ActionForm>
  );
}
