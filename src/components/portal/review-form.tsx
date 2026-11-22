"use client";
import { useState } from "react";
import { Star } from "lucide-react";
import { ActionForm, Input, SubmitButton, Textarea } from "@/components/ui/form";
import type { ActionResult } from "@/server/errors";

export function RatingInput({ name = "rating" }: { name?: string }) {
  const [v, setV] = useState(0);
  const [hover, setHover] = useState(0);
  return (
    <fieldset>
      <legend className="text-sm font-medium">Your rating</legend>
      <input type="hidden" name={name} value={v || ""} />
      <div className="mt-1 flex gap-1" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((i) => (
          <button key={i} type="button" onClick={() => setV(i)} onMouseEnter={() => setHover(i)} aria-label={`${i} star${i > 1 ? "s" : ""}`} aria-pressed={v === i} className="p-0.5">
            <Star className={`h-7 w-7 ${(hover || v) >= i ? "fill-amber-500 text-amber-500" : "text-sand-300"}`} />
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function ReviewForm({ action, hidden }: { action: (p: ActionResult<unknown> | null, fd: FormData) => Promise<ActionResult<unknown>>; hidden: Record<string, string> }) {
  return (
    <ActionForm action={action} className="space-y-3">
      {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <RatingInput />
      <Input label="Title (optional)" name="title" />
      <Textarea label="Your review" name="body" required rows={3} />
      <SubmitButton>Submit review</SubmitButton>
    </ActionForm>
  );
}
