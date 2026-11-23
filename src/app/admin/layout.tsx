import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { requirePermission } from "@/server/auth/session";
import { getSettings } from "@/server/settings";
import { AdminSidebar, type NavItem } from "@/components/portal/shell";
import { Avatar } from "@/components/ui/primitives";
import type { Permission } from "@/server/auth/permissions";
import { logout } from "@/app/(auth)/actions";

export const dynamic = "force-dynamic";

const NAV: (NavItem & { perm: Permission })[] = [
  { href: "/admin", label: "Dashboard", icon: "home", perm: "dashboard.view", group: "" },
  { href: "/admin/bookings", label: "Bookings", icon: "calendar", perm: "bookings.view", group: "Operations" },
  { href: "/admin/gardeners", label: "Gardeners", icon: "sprout", perm: "gardeners.view", group: "Operations" },
  { href: "/admin/staff", label: "Staff", icon: "usercog", perm: "staff.manage", group: "Operations" },
  { href: "/admin/activities", label: "Activities", icon: "ticket", perm: "activities.manage", group: "Operations" },
  { href: "/admin/support", label: "Support", icon: "help", perm: "support.manage", group: "Operations" },
  { href: "/admin/services", label: "Services", icon: "leaf", perm: "services.manage", group: "Catalogue" },
  { href: "/admin/products", label: "Products", icon: "package", perm: "products.manage", group: "Catalogue" },
  { href: "/admin/categories", label: "Categories & brands", icon: "tag", perm: "products.manage", group: "Catalogue" },
  { href: "/admin/inventory", label: "Inventory", icon: "warehouse", perm: "inventory.manage", group: "Commerce" },
  { href: "/admin/orders", label: "Orders", icon: "bag", perm: "orders.manage", group: "Commerce" },
  { href: "/admin/customers", label: "Customers", icon: "users", perm: "customers.view", group: "Commerce" },
  { href: "/admin/promotions", label: "Promotions", icon: "percent", perm: "promotions.manage", group: "Commerce" },
  { href: "/admin/delivery", label: "Delivery", icon: "truck", perm: "locations.manage", group: "Commerce" },
  { href: "/admin/payments", label: "Payments", icon: "card", perm: "payments.view", group: "Finance" },
  { href: "/admin/commissions", label: "Commissions", icon: "coins", perm: "commissions.manage", group: "Finance" },
  { href: "/admin/payouts", label: "Payouts", icon: "banknote", perm: "payouts.manage", group: "Finance" },
  { href: "/admin/reports", label: "Reports", icon: "chart", perm: "reports.view", group: "Finance" },
  { href: "/admin/content", label: "Website content", icon: "file", perm: "content.manage", group: "Content" },
  { href: "/admin/reviews", label: "Reviews", icon: "star", perm: "reviews.moderate", group: "Content" },
  { href: "/admin/notifications", label: "Notifications", icon: "bell", perm: "notifications.manage", group: "Content" },
  { href: "/admin/locations", label: "Locations & tax", icon: "globe", perm: "locations.manage", group: "System" },
  { href: "/admin/users", label: "Users", icon: "user", perm: "users.manage", group: "System" },
  { href: "/admin/roles", label: "Roles", icon: "key", perm: "roles.manage", group: "System" },
  { href: "/admin/settings", label: "Settings", icon: "settings", perm: "settings.manage", group: "System" },
  { href: "/admin/audit-logs", label: "Audit log", icon: "history", perm: "audit.view", group: "System" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const u = await requirePermission("dashboard.view");
  const settings = await getSettings();
  const [c] = await db.execute<{ bookings: number; gardeners: number; payouts: number; tickets: number; payments: number }>(sql`select
    (select count(*) from bookings where status in ('awaiting_quote','pending_assignment','disputed'))::int as bookings,
    (select count(*) from gardener_profiles where status = 'pending')::int as gardeners,
    (select count(*) from payouts where status in ('requested','approved'))::int as payouts,
    (select count(*) from support_tickets where status = 'open')::int as tickets,
    (select count(*) from payments where provider = 'manual' and status = 'pending')::int as payments`);
  const badges: Record<string, number> = { "/admin/bookings": c!.bookings, "/admin/gardeners": c!.gardeners, "/admin/payouts": c!.payouts, "/admin/support": c!.tickets, "/admin/payments": c!.payments };
  const items = NAV.filter((n) => u.permissions.has(n.perm)).map(({ perm: _p, ...n }) => ({ ...n, badge: badges[n.href] }));
  return (
    <div className="min-h-screen bg-sand-50">
      <AdminSidebar items={items} companyName={settings.company.name} />
      <div className="lg:pl-60">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-sand-200 bg-white px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <div className="lg:hidden"><AdminSidebar items={items} companyName={settings.company.name} /></div>
            <form action="/admin/bookings" className="hidden sm:block">
              <label htmlFor="admin-search" className="sr-only">Search bookings by reference</label>
              <input id="admin-search" name="q" placeholder="Find booking, customer or reference…" className="h-9 w-80 rounded-md border border-sand-300 bg-sand-50 px-3 text-sm focus:border-forest-500 focus:bg-white focus:outline-none" />
            </form>
          </div>
          <div className="flex items-center gap-3">
            {!u.mfaEnabled && <Link href="/admin/settings/account" className="hidden rounded-sm bg-amber-400/15 px-2 py-1 text-xs font-semibold text-amber-600 md:inline">Enable two-step verification</Link>}
            <Link href="/" className="text-sm text-ink-soft hover:text-ink">View site</Link>
            <details className="relative">
              <summary className="flex cursor-pointer list-none items-center gap-2"><Avatar name={u.fullName} src={u.avatarUrl} size={32} /><span className="hidden text-sm font-medium sm:inline">{u.fullName}</span></summary>
              <div className="absolute right-0 mt-2 w-52 rounded-md border border-sand-200 bg-white py-1 shadow-pop">
                <p className="px-3 py-2 text-xs text-ink-muted">{u.roles.join(", ")}</p>
                <Link href="/admin/settings/account" className="block px-3 py-2 text-sm hover:bg-sand-50">My account & security</Link>
                <form action={logout}><button className="block w-full px-3 py-2 text-left text-sm text-clay-600 hover:bg-sand-50">Sign out</button></form>
              </div>
            </details>
          </div>
        </header>
        <main id="main" className="p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
