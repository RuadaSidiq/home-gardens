"use client";
import { ActionForm, Checkbox, Input, Select, SubmitButton } from "@/components/ui/form";
import { createCompanyGardener } from "../../_actions/gardeners";

export function NewGardenerForm({ cities, services }: { cities: { id: number; name: string }[]; services: { id: string; name: string }[] }) {
  return (
    <ActionForm action={createCompanyGardener} refresh={false} className="grid max-w-3xl gap-4 sm:grid-cols-2">
      <Input label="Full name" name="fullName" required />
      <Input label="Email" name="email" type="email" required />
      <Input label="Phone" name="phone" type="tel" required />
      <Input label="Employee ID" name="employeeId" required placeholder="HG-G-104" />
      <Input label="Role / headline" name="headline" required placeholder="Gardener · lawns & hedges" />
      <Select label="Base area" name="baseCityId" required placeholder="Choose" options={cities.map((c) => ({ value: c.id, label: c.name }))} />
      <Input label="Years of experience" name="yearsExperience" type="number" min={0} defaultValue={0} />
      <div className="sm:col-span-2">
        <p className="mb-2 text-sm font-medium">Trained for</p>
        <div className="grid gap-1.5 sm:grid-cols-2">{services.map((s) => <label key={s.id} className="flex items-center gap-2 text-sm"><input type="checkbox" name="services[]" value={s.id} className="accent-forest-600" />{s.name}</label>)}</div>
      </div>
      <Checkbox name="isPublic" defaultChecked label="Show public profile in Find a gardener" className="sm:col-span-2" />
      <div className="sm:col-span-2"><SubmitButton>Create company gardener</SubmitButton></div>
    </ActionForm>
  );
}
