import { and, eq, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/server/auth/session";
import { SiteHeader } from "@/components/site/header";
import { PortalNav, type NavItem } from "@/components/portal/shell";
import { Avatar } from "@/components/ui/primitives";

export const dynamic = "force-dynamic";

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser("/account");
  const [n] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(schema.notifications).where(and(eq(schema.notifications.userId, user.id), isNull(schema.notifications.readAt)));
  const items: NavItem[] = [
    { href: "/account", label: "Overview", icon: "home" },
    { href: "/account/bookings", label: "Bookings", icon: "calendar" },
    { href: "/account/orders", label: "Orders", icon: "bag" },
    { href: "/account/activities", label: "Activities", icon: "ticket" },
    { href: "/account/messages", label: "Messages", icon: "message" },
    { href: "/account/wishlist", label: "Saved", icon: "heart" },
    { href: "/account/addresses", label: "Addresses", icon: "pin" },
    { href: "/account/payments", label: "Payments", icon: "card" },
    { href: "/account/reviews", label: "Reviews", icon: "star" },
    { href: "/account/notifications", label: "Notifications", icon: "bell", badge: n?.n ?? 0 },
    { href: "/account/support", label: "Support", icon: "help" },
    { href: "/account/settings", label: "Settings", icon: "settings" },
  ];
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <SiteHeader />
      <div className="container grid flex-1 gap-8 py-6 lg:grid-cols-[15rem_1fr] lg:py-10">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="mb-5 hidden items-center gap-3 px-1 lg:flex">
            <Avatar name={user.fullName} src={user.avatarUrl} size={40} />
            <div className="min-w-0"><p className="truncate font-semibold">{user.fullName}</p><p className="truncate text-xs text-ink-muted">{user.email}</p></div>
          </div>
          <PortalNav items={items} rootHref="/account" />
        </aside>
        <main id="main" className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
