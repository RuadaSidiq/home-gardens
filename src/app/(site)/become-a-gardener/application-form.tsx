"use client";
import Link from "next/link";
import { useState } from "react";
import { ActionForm, Checkbox, Input, Select, SubmitButton, Textarea, useFieldError } from "@/components/ui/form";
import { applyAsGardener } from "./actions";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <fieldset className="border-t border-sand-200 pt-8"><legend className="pr-3 text-lg font-semibold">{title}</legend><div className="mt-4 grid gap-4 sm:grid-cols-2">{children}</div></fieldset>;
}
function GroupError({ name }: { name: string }) {
  const e = useFieldError(name);
  return e ? <p className="text-[13px] text-clay-600 sm:col-span-2">{e}</p> : null;
}

export function ApplicationForm({ signedIn, defaults, cities, services, countries }: { signedIn: boolean; defaults: { name: string; email: string; phone: string }; cities: { id: number; name: string }[]; services: { id: string; name: string; category: string }[]; countries: { code: string; name: string; currency: string }[] }) {
  const [base, setBase] = useState<number | "">("");
  const [method, setMethod] = useState("momo");
  const grouped = services.reduce<Record<string, typeof services>>((a, s) => ((a[s.category] ??= []).push(s), a), {});
  return (
    <ActionForm action={applyAsGardener} refresh={false} className="mt-8 space-y-8" encType="multipart/form-data">
      <Section title="Your details">
        <Input label="Full name" name="fullName" required defaultValue={defaults.name} readOnly={signedIn} />
        <Input label="Email" name="email" type="email" required defaultValue={defaults.email} readOnly={signedIn} />
        <Input label="Phone" name="phone" type="tel" required defaultValue={defaults.phone} />
        {!signedIn && <Input label="Create a password" name="password" type="password" required autoComplete="new-password" hint="10+ characters with a letter and a number." />}
        <Input label="Profile photo" name="photo" type="file" accept="image/*" required hint="A clear, friendly photo of your face." />
      </Section>
      <Section title="Where you work">
        <Select label="Country" name="countryCode" options={countries.map((c) => ({ value: c.code, label: c.name }))} />
        <Select label="Home base" name="baseCityId" required value={base} onChange={(e) => setBase(e.target.value ? Number(e.target.value) : "")} placeholder="Select" options={cities.map((c) => ({ value: c.id, label: c.name }))} />
        <div className="sm:col-span-2">
          <p className="mb-2 text-sm font-medium">Other areas you can travel to</p>
          <div className="flex flex-wrap gap-2">
            {cities.filter((c) => c.id !== base).map((c) => (
              <label key={c.id} className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-sand-300 px-2.5 py-1.5 text-sm has-[:checked]:border-forest-600 has-[:checked]:bg-forest-50">
                <input type="checkbox" name="areas[]" value={c.id} className="accent-forest-600" />{c.name}
              </label>
            ))}
          </div>
        </div>
      </Section>
      <Section title="Your experience">
        <Input label="Headline" name="headline" required placeholder="e.g. Lawn care and hedge trimming specialist" wrapClassName="sm:col-span-2" />
        <Textarea label="About you and your work" name="bio" required wrapClassName="sm:col-span-2" rows={5} />
        <Input label="Years of experience" name="yearsExperience" type="number" min={0} max={60} required />
        <Input label="Hourly rate (GH₵)" name="hourlyRate" type="number" min={1} step="0.01" required hint="Used as your price for hourly services." />
        <Input label="Qualifications (optional)" name="qualifications" wrapClassName="sm:col-span-2" placeholder="Courses, certificates, previous employers" />
        <div className="sm:col-span-2">
          <p className="mb-2 text-sm font-medium">Services you offer <span className="text-clay-600">*</span></p>
          <div className="grid gap-4 sm:grid-cols-2">
            {Object.entries(grouped).map(([cat, list]) => (
              <div key={cat}>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{cat}</p>
                {list.map((s) => <label key={s.id} className="mt-1.5 flex items-center gap-2 text-sm"><input type="checkbox" name="services[]" value={s.id} className="accent-forest-600" />{s.name}</label>)}
              </div>
            ))}
          </div>
        </div>
        <GroupError name="services" />
        <Input label="Portfolio photos (up to 8)" name="portfolio" type="file" accept="image/*" multiple wrapClassName="sm:col-span-2" hint="Before-and-after photos of gardens you've worked on help your application." />
      </Section>
      <Section title="Availability">
        <div className="sm:col-span-2">
          <p className="mb-2 text-sm font-medium">Working days</p>
          <div className="flex flex-wrap gap-2">
            {DAYS.map((d, i) => (
              <label key={d} className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-sand-300 px-3 py-1.5 text-sm has-[:checked]:border-forest-600 has-[:checked]:bg-forest-50">
                <input type="checkbox" name="days[]" value={i} defaultChecked={i >= 1 && i <= 5} className="accent-forest-600" />{d}
              </label>
            ))}
          </div>
        </div>
        <GroupError name="days" />
        <Input label="Start time" name="startTime" type="time" defaultValue="07:00" required />
        <Input label="End time" name="endTime" type="time" defaultValue="17:00" required />
      </Section>
      <Section title="Verification">
        <Select label="ID type" name="docType" options={[{ value: "national_id", label: "Ghana Card / national ID" }, { value: "passport", label: "Passport" }, { value: "drivers_license", label: "Driver's licence" }]} />
        <Input label="ID document" name="idDocument" type="file" accept="image/*,application/pdf" required hint="PDF or photo. Stored privately; only our verification team can see it." />
        <Input label="Certificates (optional, up to 3)" name="certificates" type="file" accept="image/*,application/pdf" multiple wrapClassName="sm:col-span-2" />
      </Section>
      <Section title="How you'd like to be paid">
        <Select label="Method" name="payoutMethod" value={method} onChange={(e) => setMethod(e.target.value)} options={[{ value: "momo", label: "Mobile Money" }, { value: "bank", label: "Bank account" }]} />
        <Input label={method === "momo" ? "Network" : "Bank"} name="payoutProvider" required placeholder={method === "momo" ? "MTN MoMo / Telecel Cash / AirtelTigo Money" : "Bank name"} />
        <Input label="Account name" name="payoutAccountName" required />
        <Input label={method === "momo" ? "Mobile Money number" : "Account number"} name="payoutAccountNumber" required hint="Encrypted and only shown masked." />
      </Section>
      <div className="border-t border-sand-200 pt-8">
        <Checkbox name="agree" label={<>I confirm the information is accurate and accept the <Link href="/pages/terms" className="link" target="_blank">gardener terms</Link>.</>} />
        <SubmitButton size="lg" className="mt-6" pendingLabel="Submitting…">Submit application</SubmitButton>
      </div>
    </ActionForm>
  );
}
