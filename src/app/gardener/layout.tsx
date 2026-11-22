import Link from "next/link";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireGardener } from "@/server/auth/session";
import { getSettings } from "@/server/settings";
import { Logo } from "@/components/site/logo";
import { PortalNav, type NavItem } from "@/components/portal/shell";
import { Avatar, Badge } from "@/components/ui/primitives";

export const dynamic = "force-dynamic";

export default async function GardenerLayout({ children }: { children: React.ReactNode }) {
  const u = await requireGardener();
  const settings = await getSettings();
  const [[offers], [unread], [notes]] = await Promise.all([
    db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(schema.bookings).where(and(eq(schema.bookings.gardenerId, u.gardenerId), eq(schema.bookings.status, "assigned"))),
    db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(schema.conversationParticipants).innerJoin(schema.conversations, eq(schema.conversations.id, schema.conversationParticipants.conversationId)).where(and(eq(schema.conversationParticipants.userId, u.id), sql`(${schema.conversationParticipants.lastReadAt} is null or ${schema.conversationParticipants.lastReadAt} < ${schema.conversations.lastMessageAt})`)),
    db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(schema.notifications).where(and(eq(schema.notifications.userId, u.id), isNull(schema.notifications.readAt))),
  ]);
  const independent = u.gardenerType === "independent";
  const items: NavItem[] = [
    { href: "/gardener/dashboard", label: "Home", icon: "home" },
    { href: "/gardener/jobs", label: "Jobs", icon: "briefcase", badge: offers?.n ?? 0 },
    { href: "/gardener/availability", label: "Schedule", icon: "clock" },
    { href: "/gardener/messages", label: "Messages", icon: "message", badge: unread?.n ?? 0 },
    { href: independent ? "/gardener/earnings" : "/gardener/reviews", label: independent ? "Earnings" : "Reviews", icon: independent ? "wallet" : "star" },
    { href: "/gardener/services", label: "Services & areas", icon: "leaf" },
    ...(independent ? [{ href: "/gardener/payouts", label: "Payouts", icon: "banknote" as const }, { href: "/gardener/reviews", label: "Reviews", icon: "star" as const }] : []),
    { href: "/gardener/profile", label: "Profile & portfolio", icon: "user" },
    { href: "/gardener/support", label: "Support", icon: "help" },
    { href: "/gardener/settings", label: "Settings", icon: "settings" },
  ];
  return (
    <div className="min-h-screen bg-sand-50 pb-20 lg:pb-0">
      <header className="sticky top-0 z-30 border-b border-sand-200 bg-white">
        <div className="container flex h-14 items-center justify-between">
          <Logo name={settings.company.name} href="/gardener/dashboard" className="[&>span]:text-base" />
          <div className="flex items-center gap-3">
            <Link href="/account/notifications" className="text-sm font-medium text-ink-soft hover:text-ink">Notifications{notes?.n ? ` (${notes.n})` : ""}</Link>
            <Badge tone={independent ? "neutral" : "dark"} className="hidden sm:inline-flex">{independent ? "Independent" : "Company gardener"}</Badge>
            <Avatar name={u.fullName} src={u.avatarUrl} size={32} />
          </div>
        </div>
      </header>
      <div className="container grid gap-8 py-6 lg:grid-cols-[14rem_1fr] lg:py-8">
        <aside className="lg:sticky lg:top-20 lg:self-start"><PortalNav items={items} rootHref="/gardener/dashboard" mobile="bottom" /></aside>
        <main id="main" className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
