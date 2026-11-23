"use client";
import { ActionButton, ActionForm, SubmitButton } from "@/components/ui/form";
import { moderate } from "../_actions/system";

export function ReviewControls({ reviewId, status, response }: { reviewId: string; status: string; response: string | null }) {
  return (
    <div className="space-y-2">
      <ActionButton action={moderate} fields={{ reviewId, status: status === "published" ? "hidden" : "published" }} variant={status === "published" ? "ghost" : "secondary"}>{status === "published" ? "Hide" : "Publish"}</ActionButton>
      <ActionForm action={moderate} className="flex gap-1">
        <input type="hidden" name="reviewId" value={reviewId} />
        <input type="hidden" name="status" value={status === "hidden" ? "hidden" : "published"} />
        <input name="response" defaultValue={response ?? ""} placeholder="Public response" aria-label="Public response" className="h-8 min-w-0 flex-1 rounded-md border border-sand-300 px-2 text-xs" />
        <SubmitButton size="sm" variant="outline">Reply</SubmitButton>
      </ActionForm>
    </div>
  );
}
