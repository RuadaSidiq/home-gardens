"use client";
import { ActionForm, Input, Modal, Select, SubmitButton, Textarea, ActionButton } from "@/components/ui/form";
import { adminAssign, adminAutoAssign, adminCancel, adminNote, adminQuote, adminReschedule, adminResolveDispute } from "../../_actions/bookings";

export function AssignPanel({ bookingId, candidates }: { bookingId: string; candidates: { id: string; label: string }[] }) {
  return (
    <div className="space-y-3">
      <ActionForm action={adminAssign} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="bookingId" value={bookingId} />
        <Select label="Assign gardener" name="gardenerId" required placeholder={candidates.length ? "Choose an available gardener" : "No gardener is free at this time"} options={candidates.map((c) => ({ value: c.id, label: c.label }))} wrapClassName="min-w-[16rem] flex-1" />
        <SubmitButton disabled={!candidates.length}>Assign</SubmitButton>
      </ActionForm>
      <ActionButton action={adminAutoAssign} fields={{ bookingId }} variant="ghost">Assign best match automatically</ActionButton>
    </div>
  );
}

export function QuoteForm({ bookingId, currency }: { bookingId: string; currency: string }) {
  return (
    <ActionForm action={adminQuote} className="grid gap-3 sm:grid-cols-3">
      <input type="hidden" name="bookingId" value={bookingId} />
      <Input label={`Amount before tax (${currency})`} name="amount" type="number" step="0.01" min={1} required />
      <Input label="Estimated hours" name="hours" type="number" step="0.5" min={0.5} />
      <Input label="Valid for (days)" name="validDays" type="number" min={1} max={60} defaultValue={7} />
      <Textarea label="Scope and notes for the customer" name="note" rows={3} wrapClassName="sm:col-span-3" />
      <div className="sm:col-span-3"><SubmitButton>Send quote</SubmitButton></div>
    </ActionForm>
  );
}

export function StaffActions({ bookingId, currency, refundable, canCancel, canReschedule }: { bookingId: string; currency: string; refundable: number; canCancel: boolean; canReschedule: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      {canReschedule && (
        <Modal trigger="Reschedule" title="Reschedule booking">
          {() => (
            <ActionForm action={adminReschedule} className="space-y-3">
              <input type="hidden" name="bookingId" value={bookingId} />
              <div className="grid gap-3 sm:grid-cols-2"><Input label="Date" name="date" type="date" required /><Input label="Time" name="time" type="time" required /></div>
              <p className="text-xs text-ink-muted">If the assigned gardener is unavailable, the booking is reassigned automatically.</p>
              <SubmitButton>Reschedule</SubmitButton>
            </ActionForm>
          )}
        </Modal>
      )}
      {canCancel && (
        <Modal trigger="Cancel booking" title="Cancel booking" triggerVariant="danger-outline">
          {() => (
            <ActionForm action={adminCancel} className="space-y-3">
              <input type="hidden" name="bookingId" value={bookingId} />
              <Textarea label="Reason (shared with customer)" name="reason" required rows={2} />
              <Input label={`Refund amount (${currency})`} name="refund" type="number" step="0.01" min={0} max={refundable / 100} defaultValue={(refundable / 100).toFixed(2)} hint="Staff cancellations default to a full refund." />
              <SubmitButton variant="danger">Cancel and refund</SubmitButton>
            </ActionForm>
          )}
        </Modal>
      )}
    </div>
  );
}

export function DisputeForm({ bookingId, currency, refundable }: { bookingId: string; currency: string; refundable: number }) {
  return (
    <ActionForm action={adminResolveDispute} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="bookingId" value={bookingId} />
      <Select label="Outcome" name="outcome" options={[{ value: "release", label: "Release payment to gardener (job OK)" }, { value: "refund", label: "Refund customer (partial or full)" }]} />
      <Input label={`Refund (${currency}) – for refunds`} name="refund" type="number" step="0.01" min={0} max={refundable / 100} />
      <Textarea label="Resolution note" name="note" required rows={2} wrapClassName="sm:col-span-2" />
      <div className="sm:col-span-2"><SubmitButton>Resolve dispute</SubmitButton></div>
    </ActionForm>
  );
}

export function NotesForm({ bookingId, value }: { bookingId: string; value: string }) {
  return (
    <ActionForm action={adminNote} className="space-y-2">
      <input type="hidden" name="bookingId" value={bookingId} />
      <Textarea name="internalNotes" defaultValue={value} rows={3} placeholder="Visible to staff only" aria-label="Internal notes" />
      <SubmitButton size="sm" variant="outline">Save note</SubmitButton>
    </ActionForm>
  );
}
