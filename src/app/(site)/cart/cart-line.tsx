"use client";
import { useTransition } from "react";
import { Minus, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { updateCartItem } from "@/app/(site)/actions";

export function QtyControl({ variantId, quantity, max }: { variantId: string; quantity: number; max: number }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const set = (q: number) => {
    const fd = new FormData();
    fd.set("variantId", variantId);
    fd.set("quantity", String(q));
    start(async () => {
      const r = await updateCartItem(null, fd);
      if (!r.ok) alert(r.error);
      router.refresh();
    });
  };
  return (
    <div className={`flex items-center gap-2 ${pending ? "opacity-50" : ""}`}>
      <div className="flex h-9 items-center rounded-md border border-sand-300">
        <button type="button" disabled={pending || quantity <= 1} onClick={() => set(quantity - 1)} className="flex h-full w-8 items-center justify-center hover:bg-sand-100 disabled:opacity-40" aria-label="Decrease"><Minus className="h-3.5 w-3.5" /></button>
        <span className="w-7 text-center text-sm font-semibold tabular-nums">{quantity}</span>
        <button type="button" disabled={pending || quantity >= max} onClick={() => set(quantity + 1)} className="flex h-full w-8 items-center justify-center hover:bg-sand-100 disabled:opacity-40" aria-label="Increase"><Plus className="h-3.5 w-3.5" /></button>
      </div>
      <button type="button" disabled={pending} onClick={() => set(0)} className="inline-flex h-9 w-9 items-center justify-center rounded-md text-ink-muted hover:bg-sand-100 hover:text-clay-600" aria-label="Remove item"><Trash2 className="h-4 w-4" /></button>
    </div>
  );
}
