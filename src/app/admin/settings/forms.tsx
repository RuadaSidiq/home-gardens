"use client";
import { ActionForm, Checkbox, Input, Select, SubmitButton } from "@/components/ui/form";
import { saveSettingsGroup } from "../_actions/system";
import type { Settings } from "@/server/settings";

function Group({ group, children }: { group: string; children: React.ReactNode }) {
  return <ActionForm action={saveSettingsGroup} className="grid gap-4 sm:grid-cols-2"><input type="hidden" name="group" value={group} />{children}<div className="sm:col-span-2"><SubmitButton>Save</SubmitButton></div></ActionForm>;
}

export function CompanyForm({ v }: { v: Settings["company"] }) {
  return <Group group="company"><Input label="Brand name" name="name" required defaultValue={v.name} /><Input label="Legal name" name="legalName" required defaultValue={v.legalName} /><Input label="Email" name="email" type="email" required defaultValue={v.email} /><Input label="Phone" name="phone" required defaultValue={v.phone} /><Input label="WhatsApp" name="whatsapp" defaultValue={v.whatsapp} /><Input label="Address" name="address" required defaultValue={v.address} /><Input label="Tagline" name="tagline" defaultValue={v.tagline} wrapClassName="sm:col-span-2" /></Group>;
}
export function BookingForm({ v }: { v: Settings["booking"] }) {
  return (
    <Group group="booking">
      <Checkbox name="autoAssign" label="Assign gardeners automatically after payment" defaultChecked={v.autoAssign} className="sm:col-span-2" />
      <Input label="Minimum notice (hours)" name="minLeadHours" type="number" defaultValue={v.minLeadHours} />
      <Input label="Book up to (days ahead)" name="maxAdvanceDays" type="number" defaultValue={v.maxAdvanceDays} />
      <Input label="Free cancellation until (hours before)" name="freeCancellationHours" type="number" defaultValue={v.freeCancellationHours} />
      <Input label="Late cancellation fee (%)" name="lateCancellationFeePercent" type="number" defaultValue={v.lateCancellationFeePercent} />
      <Input label="Reschedules allowed per booking" name="maxReschedules" type="number" defaultValue={v.maxReschedules} />
      <Input label="Auto-confirm completion after (hours)" name="autoCompleteHours" type="number" defaultValue={v.autoCompleteHours} />
      <Input label="Gardener response window (hours)" name="gardenerResponseHours" type="number" defaultValue={v.gardenerResponseHours} />
      <Input label="Time-slot length (minutes)" name="slotMinutes" type="number" defaultValue={v.slotMinutes} />
    </Group>
  );
}
export function CommerceForm({ v, warehouses }: { v: Settings["commerce"]; warehouses: string[] }) {
  return <Group group="commerce"><Checkbox name="allowBackorders" label="Allow backorders on all products" defaultChecked={v.allowBackorders} /><Checkbox name="vendorMarketplace" label="Enable third-party vendor marketplace" defaultChecked={v.vendorMarketplace} /><Input label="Return window (days)" name="returnWindowDays" type="number" defaultValue={v.returnWindowDays} /><Select label="Default warehouse" name="defaultWarehouseCode" defaultValue={v.defaultWarehouseCode} options={warehouses.map((w) => ({ value: w, label: w }))} /></Group>;
}
export function FinanceForm({ v, currencies }: { v: Settings["finance"]; currencies: string[] }) {
  return <Group group="finance"><Select label="Reporting base currency" name="baseCurrency" defaultValue={v.baseCurrency} options={currencies.map((c) => ({ value: c, label: c }))} /><Input label="Default commission (%)" name="defaultCommissionPercent" type="number" step="0.01" defaultValue={v.defaultCommissionBps / 100} /><Input label="Earnings hold period (days)" name="payoutHoldDays" type="number" defaultValue={v.payoutHoldDays} /><Input label="Minimum payout" name="minimumPayout" type="number" step="0.01" defaultValue={v.minimumPayout / 100} /></Group>;
}
export function SocialForm({ v }: { v: Settings["social"] }) {
  return <Group group="social"><Input label="Facebook URL" name="facebook" defaultValue={v.facebook} /><Input label="Instagram URL" name="instagram" defaultValue={v.instagram} /><Input label="X URL" name="x" defaultValue={v.x} /><Input label="YouTube URL" name="youtube" defaultValue={v.youtube} /></Group>;
}
