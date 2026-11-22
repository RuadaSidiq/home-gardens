"use client";
import { ActionForm, Modal, SubmitButton, Textarea } from "@/components/ui/form";
import { requestMyReturn } from "../../actions";

export function ReturnRequest({ orderId, items }: { orderId: string; items: { id: string; name: string; max: number }[] }) {
  return (
    <Modal trigger="Request a return" title="Request a return">
      {() => (
        <ActionForm action={requestMyReturn} className="space-y-4">
          <input type="hidden" name="orderId" value={orderId} />
          <ul className="space-y-2">
            {items.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 text-sm">
                <label htmlFor={`q-${i.id}`}>{i.name}</label>
                <select id={`q-${i.id}`} name={`qty_${i.id}`} className="h-9 rounded-md border border-sand-300 px-2">{Array.from({ length: i.max + 1 }, (_, n) => <option key={n} value={n}>{n}</option>)}</select>
              </li>
            ))}
          </ul>
          <Textarea label="Reason" name="reason" required rows={3} />
          <SubmitButton>Submit request</SubmitButton>
        </ActionForm>
      )}
    </Modal>
  );
}
