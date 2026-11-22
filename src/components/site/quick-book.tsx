"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight } from "lucide-react";

export function QuickBook({ services, cities }: { services: { slug: string; name: string; category: string }[]; cities: { id: number; name: string; region: string | null }[] }) {
  const router = useRouter();
  const [svc, setSvc] = useState("");
  const [city, setCity] = useState("");
  const grouped = services.reduce<Record<string, typeof services>>((acc, s) => ((acc[s.category] ??= []).push(s), acc), {});
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!svc) return;
        router.push(`/services/${svc}/book${city ? `?city=${city}` : ""}`);
      }}
      className="grid gap-2 rounded-lg border border-sand-200 bg-white p-2 shadow-pop sm:grid-cols-[1.4fr_1fr_auto]"
    >
      <label className="block rounded-md px-3 py-1.5 hover:bg-sand-50">
        <span className="block text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Service</span>
        <select required value={svc} onChange={(e) => setSvc(e.target.value)} className="w-full bg-transparent py-0.5 text-[15px] font-medium focus:outline-none">
          <option value="">What do you need?</option>
          {Object.entries(grouped).map(([cat, list]) => (
            <optgroup key={cat} label={cat}>
              {list.map((s) => <option key={s.slug} value={s.slug}>{s.name}</option>)}
            </optgroup>
          ))}
        </select>
      </label>
      <label className="block rounded-md px-3 py-1.5 hover:bg-sand-50 sm:border-l sm:border-sand-200">
        <span className="block text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Area</span>
        <select value={city} onChange={(e) => setCity(e.target.value)} className="w-full bg-transparent py-0.5 text-[15px] font-medium focus:outline-none">
          <option value="">Select your area</option>
          {cities.map((c) => <option key={c.id} value={c.id}>{c.name}{c.region ? `, ${c.region}` : ""}</option>)}
        </select>
      </label>
      <button type="submit" className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-forest-600 px-5 font-semibold text-white hover:bg-forest-700 sm:h-auto">
        Check availability <ArrowRight className="h-4 w-4" />
      </button>
    </form>
  );
}
