import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/server/auth/session";
import { EmptyState, PageHeader } from "@/components/ui/primitives";
import { ActionButton } from "@/components/ui/form";
import { relativeTime, cn } from "@/lib/utils";
import { markAllRead } from "@/app/account/actions";

export const metadata = { title: "Notifications" };

export default async function Notifications() {
  const u = await requireUser();
  const rows = await db.select().from(schema.notifications).where(eq(schema.notifications.userId, u.id)).orderBy(desc(schema.notifications.createdAt)).limit(100);
  return (
    <>
      <PageHeader title="Notifications" actions={rows.some((r) => !r.readAt) && <ActionButton action={markAllRead}>Mark all as read</ActionButton>} />
      {rows.length === 0 ? <EmptyState title="No notifications" /> : (
        <ul className="divide-y divide-sand-100 rounded-lg border border-sand-200 bg-white">
          {rows.map((n) => {
            const inner = (
              <div className="flex gap-3 px-4 py-3.5">
                <span className={cn("mt-2 h-2 w-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-forest-600")} />
                <div className="min-w-0 flex-1"><p className={cn("text-sm", !n.readAt && "font-semibold")}>{n.title}</p><p className="text-sm text-ink-muted">{n.body}</p></div>
                <span className="shrink-0 text-xs text-ink-muted">{relativeTime(n.createdAt)}</span>
              </div>
            );
            return <li key={n.id}>{n.link ? <Link href={n.link} className="block hover:bg-sand-50">{inner}</Link> : inner}</li>;
          })}
        </ul>
      )}
    </>
  );
}
