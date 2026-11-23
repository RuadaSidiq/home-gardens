"use client";
import { ActionForm, ActionButton, Checkbox, Input, Modal, SubmitButton, Textarea } from "@/components/ui/form";
import { fulfilOrder, handleReturn, saveOrderNote, staffCancelOrder } from "../../_actions/commerce";

export function FulfilmentControls({ orderId, status }: { orderId: string; status: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {status === "paid" && <ActionButton action={fulfilOrder} fields={{ orderId, action: "processing" }} variant="outline" size="md">Start picking</ActionButton>}
      {(status === "paid" || status === "processing") && (
        <Modal trigger="Mark dispatched" title="Dispatch order" triggerVariant="primary" triggerSize="md">
          {(close) => (
            <ActionForm action={fulfilOrder} onSuccess={close} className="space-y-3">
              <input type="hidden" name="orderId" value={orderId} />
              <input type="hidden" name="action" value="shipped" />
              <div className="grid gap-3 sm:grid-cols-2"><Input label="Carrier" name="carrier" placeholder="Own fleet, DHL, …" /><Input label="Tracking number" name="trackingNumber" /></div>
              <SubmitButton>Mark dispatched and notify customer</SubmitButton>
            </ActionForm>
          )}
        </Modal>
      )}
      {status === "shipped" && <ActionButton action={fulfilOrder} fields={{ orderId, action: "delivered" }} variant="primary" size="md">Mark delivered</ActionButton>}
      {["pending_payment", "paid", "processing"].includes(status) && (
        <Modal trigger="Cancel order" title="Cancel order" triggerVariant="danger-outline" triggerSize="md">
          {() => (
            <ActionForm action={staffCancelOrder} className="space-y-3">
              <input type="hidden" name="orderId" value={orderId} />
              <Textarea label="Reason" name="reason" required rows={2} />
              <p className="text-xs text-ink-muted">Stock is released and the customer refunded in full.</p>
              <SubmitButton variant="danger">Cancel order</SubmitButton>
            </ActionForm>
          )}
        </Modal>
      )}
    </div>
  );
}

export function ReturnControls({ returnId, status }: { returnId: string; status: string }) {
  if (status === "requested") return <div className="flex gap-1"><ActionButton action={handleReturn} fields={{ returnId, action: "approve" }} variant="secondary">Approve</ActionButton><ActionButton action={handleReturn} fields={{ returnId, action: "reject" }} variant="ghost" confirm="Reject this return?">Reject</ActionButton></div>;
  if (status === "approved")
    return (
      <ActionForm action={handleReturn} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="returnId" value={returnId} />
        <input type="hidden" name="action" value="receive_refund" />
        <Checkbox name="restock" defaultChecked label="Return items to stock" />
        <SubmitButton size="sm">Received – refund</SubmitButton>
      </ActionForm>
    );
  return null;
}

export function OrderNote({ orderId, value }: { orderId: string; value: string }) {
  return (
    <ActionForm action={saveOrderNote} className="space-y-2">
      <input type="hidden" name="orderId" value={orderId} />
      <Textarea name="internalNote" defaultValue={value} rows={3} aria-label="Internal note" placeholder="Staff only" />
      <SubmitButton size="sm" variant="outline">Save</SubmitButton>
    </ActionForm>
  );
}
