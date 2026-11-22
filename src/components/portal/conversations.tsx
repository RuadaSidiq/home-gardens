import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth/session";
import { listConversations, loadConversation } from "@/server/messaging";
import { Avatar, Breadcrumbs, EmptyState, PageHeader } from "@/components/ui/primitives";
import { Thread } from "@/components/portal/thread";
import { postMessage } from "@/app/account/actions";
import { relativeTime, cn } from "@/lib/utils";

export async function ConversationList({ base }: { base: string }) {
  const u = await requireUser();
  const list = await listConversations(u.id);
  if (!list.length) return <EmptyState title="No messages yet" description="Conversations about bookings and support requests appear here." />;
  return (
    <ul className="divide-y divide-sand-100 rounded-lg border border-sand-200 bg-white">
      {list.map((c) => (
        <li key={c.id}>
          <Link href={`${base}/${c.id}`} className="flex items-center gap-3 px-4 py-3.5 hover:bg-sand-50">
            <Avatar name={c.with[0]?.name ?? "Support"} src={c.with[0]?.avatar} size={40} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2"><p className={cn("truncate", c.unread ? "font-bold" : "font-medium")}>{c.with.map((w) => w.name).join(", ") || "Home Gardens support"}</p><span className="shrink-0 text-xs text-ink-muted">{relativeTime(c.lastMessageAt)}</span></div>
              <p className="truncate text-sm text-ink-muted">{c.subject}{c.preview ? ` · ${c.preview.body}` : ""}</p>
            </div>
            {c.unread && <span className="h-2.5 w-2.5 rounded-full bg-forest-600" aria-label="Unread" />}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export async function ConversationView({ id, base, backLabel, children }: { id: string; base: string; backLabel: string; children?: React.ReactNode }) {
  const u = await requireUser();
  const data = await loadConversation(id, u).catch(() => null);
  if (!data) notFound();
  return (
    <>
      <Breadcrumbs items={[{ label: backLabel, href: base }, { label: data.c.subject }]} />
      <PageHeader title={data.c.subject} className="mt-2" />
      {children}
      <Thread conversationId={id} meId={u.id} action={postMessage} messages={data.messages.map((m) => ({ id: m.m.id, body: m.m.body, senderId: m.m.senderId, sender: m.sender, avatar: m.avatar, createdAt: m.m.createdAt.toISOString(), internal: m.m.internal, attachments: m.m.attachments }))} />
    </>
  );
}
