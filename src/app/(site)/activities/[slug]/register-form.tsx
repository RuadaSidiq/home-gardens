"use client";
import { useState } from "react";
import { ActionForm, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { registerActivity } from "./actions";

type S = { id: string; label: string; left: number; closed: boolean };

export function RegisterForm({ sessions, price, currency, maxPer }: { sessions: S[]; price: number; currency: string; maxPer: number }) {
  const first = sessions.find((s) => s.left > 0 && !s.closed);
  const [sid, setSid] = useState(first?.id ?? "");
  const [qty, setQty] = useState(1);
  const s = sessions.find((x) => x.id === sid);
  const max = Math.max(1, Math.min(maxPer, s?.left ?? 1));
  return (
    <ActionForm action={registerActivity} refresh={false} className="space-y-4">
      <input type="hidden" name="sessionId" value={sid} />
      <fieldset>
        <legend className="text-sm font-semibold">Choose a date</legend>
        <div className="mt-2 grid gap-2">
          {sessions.map((x) => (
            <label key={x.id} className={cn("flex cursor-pointer items-center justify-between gap-3 rounded-md border px-3 py-2.5 text-sm", sid === x.id ? "border-forest-600 bg-forest-50" : "border-sand-300", (x.left <= 0 || x.closed) && "cursor-not-allowed opacity-50")}>
              <span className="flex items-center gap-2"><input type="radio" name="_s" disabled={x.left <= 0 || x.closed} checked={sid === x.id} onChange={() => { setSid(x.id); setQty(1); }} className="accent-forest-600" />{x.label}</span>
              <span className="text-xs text-ink-muted">{x.closed ? "Closed" : x.left <= 0 ? "Full" : `${x.left} left`}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <Select label="Number of people" name="quantity" value={qty} onChange={(e) => setQty(Number(e.target.value))} options={Array.from({ length: max }, (_, i) => ({ value: i + 1, label: String(i + 1) }))} />
      {qty > 1 && <Textarea label="Attendee names (optional)" name="names" rows={2} placeholder="One per line" />}
      <div className="flex items-center justify-between border-t border-sand-200 pt-4"><span className="text-sm text-ink-muted">Total</span><span className="text-xl font-bold">{price === 0 ? "Free" : formatMoney(price * qty, currency)}</span></div>
      <SubmitButton size="lg" className="w-full" disabled={!sid}>{price === 0 ? "Register" : "Register and pay"}</SubmitButton>
    </ActionForm>
  );
}
