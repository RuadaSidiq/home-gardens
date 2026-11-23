"use client";
import { ActionForm, ActionButton, Input, Modal, SubmitButton } from "@/components/ui/form";
import { confirmTransfer, issueRefund, markRefundProcessed, recheckPayment, rejectTransfer } from "../_actions/finance";

export function ManualConfirm({ paymentId }: { paymentId: string }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <Modal trigger="Confirm" title="Confirm transfer received" triggerVariant="primary">
        {(close) => (
          <ActionForm action={confirmTransfer} onSuccess={close} className="space-y-3">
            <input type="hidden" name="paymentId" value={paymentId} />
            <p className="text-sm text-ink-soft">Only confirm after checking the bank or Mobile Money statement for the exact amount and reference.</p>
            <Input label="Statement / transaction reference" name="transferReference" required />
            <SubmitButton>Confirm payment</SubmitButton>
          </ActionForm>
        )}
      </Modal>
      <ActionButton action={rejectTransfer} fields={{ paymentId }} variant="ghost" confirm="Mark this transfer as not received?">Not received</ActionButton>
    </div>
  );
}

export function Refund({ paymentId, max, currency }: { paymentId: string; max: number; currency: string }) {
  return (
    <Modal trigger="Refund" title="Issue refund" triggerVariant="ghost">
      {(close) => (
        <ActionForm action={issueRefund} onSuccess={() => setTimeout(close, 1200)} className="space-y-3">
          <input type="hidden" name="paymentId" value={paymentId} />
          <Input label={`Amount (${currency}), up to ${(max / 100).toFixed(2)}`} name="amount" type="number" step="0.01" min={0.01} max={max / 100} defaultValue={(max / 100).toFixed(2)} required />
          <Input label="Reason" name="reason" required />
          <p className="text-xs text-ink-muted">Card and Paystack/Stripe/PayPal refunds are sent to the provider. Manual and Hubtel refunds must be completed outside and then marked processed.</p>
          <SubmitButton variant="danger">Refund</SubmitButton>
        </ActionForm>
      )}
    </Modal>
  );
}

export function Recheck({ reference }: { reference: string }) {
  return <ActionButton action={recheckPayment} fields={{ reference }} variant="ghost">Re-check with provider</ActionButton>;
}

export function SettleRefund({ refundId }: { refundId: string }) {
  return (
    <ActionForm action={markRefundProcessed} className="flex items-center gap-1">
      <input type="hidden" name="refundId" value={refundId} />
      <input name="providerReference" required placeholder="Transfer ref." aria-label="Refund transfer reference" className="h-8 w-28 rounded-md border border-sand-300 px-2 text-xs" />
      <SubmitButton size="sm" variant="outline">Mark processed</SubmitButton>
    </ActionForm>
  );
}
