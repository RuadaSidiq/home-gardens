"use client";
import { useEffect, useRef } from "react";
import { ActionForm, SubmitButton, Checkbox } from "@/components/ui/form";
import { Avatar } from "@/components/ui/primitives";
import { cn, formatDateTime } from "@/lib/utils";
import type { ActionResult } from "@/server/errors";

type Msg = { id: string; body: string; senderId: string; sender: string; avatar: string | null; createdAt: string; internal: boolean; attachments: { url: string; name: string }[] };

export function Thread({ messages, meId, action, conversationId, canInternal, disabled }: { messages: Msg[]; meId: string; action: (p: ActionResult<unknown> | null, fd: FormData) => Promise<ActionResult<unknown>>; conversationId: string; canInternal?: boolean; disabled?: string }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ block: "end" }), [messages.length]);
  return (
    <div className="flex flex-col rounded-lg border border-sand-200 bg-white">
      <ol className="max-h-[60vh] min-h-[240px] space-y-4 overflow-y-auto p-4" aria-live="polite">
        {messages.length === 0 && <li className="py-10 text-center text-sm text-ink-muted">No messages yet.</li>}
        {messages.map((m) => {
          const mine = m.senderId === meId;
          return (
            <li key={m.id} className={cn("flex gap-2.5", mine && "flex-row-reverse")}>
              <Avatar name={m.sender} src={m.avatar} size={32} />
              <div className={cn("max-w-[80%] rounded-lg px-3.5 py-2.5 text-sm", m.internal ? "border border-amber-400/50 bg-amber-400/10" : mine ? "bg-forest-600 text-white" : "bg-sand-100")}>
                <p className={cn("mb-0.5 text-xs font-semibold", mine && !m.internal ? "text-forest-100" : "text-ink-muted")}>{m.internal ? "Internal note · " : ""}{mine ? "You" : m.sender} · {formatDateTime(m.createdAt)}</p>
                <p className="whitespace-pre-wrap">{m.body}</p>
                {m.attachments.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {m.attachments.map((a) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <a key={a.url} href={a.url} target="_blank" rel="noopener noreferrer"><img src={a.url} alt={a.name} className="h-20 w-20 rounded object-cover" /></a>
                    ))}
                  </div>
                )}
              </div>
            </li>
          );
        })}
        <div ref={end} />
      </ol>
      {disabled ? (
        <p className="border-t border-sand-200 p-4 text-sm text-ink-muted">{disabled}</p>
      ) : (
        <ActionForm action={action} resetOnSuccess className="border-t border-sand-200 p-3" encType="multipart/form-data">
          <input type="hidden" name="conversationId" value={conversationId} />
          <label htmlFor="msg" className="sr-only">Message</label>
          <textarea id="msg" name="body" required rows={2} placeholder="Write a message…" className="block w-full resize-y rounded-md border border-sand-300 px-3 py-2 text-[15px] focus:border-forest-500 focus:outline-none" />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-4">
              <label className="text-xs text-ink-muted">Photos <input name="attachments" type="file" accept="image/*" multiple className="ml-1 text-xs" /></label>
              {canInternal && <Checkbox name="internal" label="Internal note (staff only)" />}
            </div>
            <SubmitButton size="sm">Send</SubmitButton>
          </div>
        </ActionForm>
      )}
    </div>
  );
}
