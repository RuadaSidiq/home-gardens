"use client";
import { ActionForm, Input, SubmitButton, Textarea } from "@/components/ui/form";
import { resubmitApplication } from "../actions";
export function ResubmitForm() {
  return (
    <ActionForm action={resubmitApplication} className="space-y-4" encType="multipart/form-data">
      <Textarea label="Your response" name="note" required rows={3} />
      <Input label="Documents (optional, up to 3)" name="documents" type="file" accept="image/*,application/pdf" multiple />
      <SubmitButton>Send to review team</SubmitButton>
    </ActionForm>
  );
}
