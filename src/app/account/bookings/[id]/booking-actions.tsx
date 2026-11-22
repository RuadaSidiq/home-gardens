"use client";
import { ActionForm, Input, Modal, SubmitButton, Textarea } from "@/components/ui/form";
import { cancelMyBooking, disputeMyBooking, rescheduleMyBooking } from "../../actions";

export function CancelBooking({ bookingId, policy }: { bookingId: string; policy: string }) {
  return (
    <Modal trigger="Cancel booking" title="Cancel this booking?" triggerVariant="danger-outline">
      {() => (
        <ActionForm action={cancelMyBooking} className="space-y-4">
          <input type="hidden" name="bookingId" value={bookingId} />
          <p className="text-sm text-ink-soft">{policy}</p>
          <Textarea label="Reason" name="reason" required rows={2} />
          <SubmitButton variant="danger">Cancel booking</SubmitButton>
        </ActionForm>
      )}
    </Modal>
  );
}

export function RescheduleBooking({ bookingId, minDate }: { bookingId: string; minDate: string }) {
  return (
    <Modal trigger="Reschedule" title="Choose a new time">
      {() => (
        <ActionForm action={rescheduleMyBooking} className="space-y-4">
          <input type="hidden" name="bookingId" value={bookingId} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="New date" name="date" type="date" min={minDate} required />
            <Input label="Start time" name="time" type="time" min="07:00" max="17:00" step={1800} required />
          </div>
          <p className="text-xs text-ink-muted">If your gardener isn't free at the new time, we'll match you with another available gardener.</p>
          <SubmitButton>Reschedule</SubmitButton>
        </ActionForm>
      )}
    </Modal>
  );
}

export function DisputeBooking({ bookingId }: { bookingId: string }) {
  return (
    <Modal trigger="Report a problem" title="Report a problem with this job" triggerVariant="danger-outline">
      {() => (
        <ActionForm action={disputeMyBooking} className="space-y-4">
          <input type="hidden" name="bookingId" value={bookingId} />
          <p className="text-sm text-ink-soft">Payment to the gardener is held while our support team looks into it. You can add photos in the support thread.</p>
          <Textarea label="What went wrong?" name="reason" required rows={4} />
          <SubmitButton variant="danger">Submit</SubmitButton>
        </ActionForm>
      )}
    </Modal>
  );
}
