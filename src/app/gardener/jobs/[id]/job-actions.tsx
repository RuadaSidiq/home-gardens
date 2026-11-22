"use client";
import { ActionForm, Input, Modal, SubmitButton, Textarea } from "@/components/ui/form";
import { completeMyJob, proposeQuote, respondJob, startMyJob } from "../../actions";

export function RespondJob({ bookingId, canQuote, currency }: { bookingId: string; canQuote: boolean; currency: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      <ActionForm action={respondJob} showMessage>
        <input type="hidden" name="bookingId" value={bookingId} />
        <input type="hidden" name="accept" value="1" />
        <SubmitButton size="lg">Accept job</SubmitButton>
      </ActionForm>
      <Modal trigger="Decline" title="Decline this job" triggerVariant="outline" triggerSize="lg">
        {() => (
          <ActionForm action={respondJob} className="space-y-4">
            <input type="hidden" name="bookingId" value={bookingId} />
            <input type="hidden" name="accept" value="0" />
            <Textarea label="Reason (shared with our team)" name="reason" rows={2} placeholder="e.g. Equipment unavailable that day" />
            <SubmitButton variant="danger">Decline job</SubmitButton>
          </ActionForm>
        )}
      </Modal>
      {canQuote && (
        <Modal trigger="Propose a different price" title="Propose a revised price" triggerVariant="ghost" triggerSize="lg">
          {() => (
            <ActionForm action={proposeQuote} className="space-y-4">
              <input type="hidden" name="bookingId" value={bookingId} />
              <p className="text-sm text-ink-soft">If the job is bigger or smaller than described, propose a price before tax. The customer must accept it; accepting also confirms you for the job.</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input label={`Price (${currency})`} name="amount" type="number" min={1} step="0.01" required />
                <Input label="Estimated hours" name="hours" type="number" min={0.5} step="0.5" />
              </div>
              <Textarea label="Explain the price" name="note" required rows={3} />
              <SubmitButton>Send to customer</SubmitButton>
            </ActionForm>
          )}
        </Modal>
      )}
    </div>
  );
}

export function StartJob({ bookingId }: { bookingId: string }) {
  return (
    <ActionForm action={startMyJob} className="space-y-3" encType="multipart/form-data">
      <input type="hidden" name="bookingId" value={bookingId} />
      <Input label="Before photos (recommended)" name="photos" type="file" accept="image/*" multiple capture="environment" />
      <SubmitButton size="lg" className="w-full sm:w-auto">Start job</SubmitButton>
    </ActionForm>
  );
}

export function CompleteJob({ bookingId }: { bookingId: string }) {
  return (
    <ActionForm action={completeMyJob} className="space-y-3" encType="multipart/form-data">
      <input type="hidden" name="bookingId" value={bookingId} />
      <Input label="Photos of the finished work" name="photos" type="file" accept="image/*" multiple required capture="environment" hint="At least one photo is required." />
      <Textarea label="Notes for the customer (optional)" name="note" rows={2} placeholder="e.g. Water the new turf daily for two weeks" />
      <SubmitButton size="lg" className="w-full sm:w-auto">Mark job complete</SubmitButton>
    </ActionForm>
  );
}
