"use client";
import { ActionForm, ActionButton, Input, Modal, SubmitButton, Textarea } from "@/components/ui/form";
import { payoutDecision, revealPayoutDetails } from "../_actions/finance";

export function PayoutControls({ payoutId, status }: { payoutId: string; status: string }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <ActionForm action={revealPayoutDetails} refresh={false} className="text-xs"><input type="hidden" name="payoutId" value={payoutId} /><button className="link">Show account</button></ActionForm>
      {status === "requested" && <ActionButton action={payoutDecision} fields={{ payoutId, decision: "approved" }} variant="secondary">Approve</ActionButton>}
      <Modal trigger="Mark paid" title="Record payout transfer" triggerVariant="primary">
        {(close) => (
          <ActionForm action={payoutDecision} onSuccess={close} className="space-y-3">
            <input type="hidden" name="payoutId" value={payoutId} />
            <input type="hidden" name="decision" value="paid" />
            <p className="text-sm text-ink-soft">Send the money through your bank or Mobile Money business account, then record the transfer reference here.</p>
            <Input label="Channel" name="provider" placeholder="MTN MoMo business / bank transfer" />
            <Input label="Transfer reference" name="providerReference" required />
            <SubmitButton>Mark paid and notify gardener</SubmitButton>
          </ActionForm>
        )}
      </Modal>
      <Modal trigger="Reject" title="Reject payout" triggerVariant="ghost">
        {(close) => (
          <ActionForm action={payoutDecision} onSuccess={close} className="space-y-3">
            <input type="hidden" name="payoutId" value={payoutId} />
            <input type="hidden" name="decision" value="rejected" />
            <Textarea label="Reason (shared with gardener)" name="note" required rows={2} />
            <SubmitButton variant="danger">Reject – return funds to balance</SubmitButton>
          </ActionForm>
        )}
      </Modal>
    </div>
  );
}
