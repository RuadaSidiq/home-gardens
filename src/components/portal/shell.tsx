"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import * as I from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/site/logo";

export type NavItem = { href: string; label: string; icon: keyof typeof ICONS; badge?: number; group?: string };

const ICONS = {
  home: I.LayoutDashboard, calendar: I.CalendarDays, bag: I.ShoppingBag, ticket: I.CalendarCheck, heart: I.Heart, pin: I.MapPin, card: I.CreditCard,
  star: I.Star, bell: I.Bell, help: I.LifeBuoy, settings: I.Settings, message: I.MessageSquare, briefcase: I.Briefcase, clock: I.Clock, leaf: I.Leaf,
  wallet: I.Wallet, banknote: I.Banknote, user: I.User, users: I.Users, usercog: I.UserCog, package: I.Package, boxes: I.Boxes, truck: I.Truck,
  receipt: I.Receipt, percent: I.Percent, tag: I.Tag, globe: I.Globe, chart: I.ChartColumn, file: I.FileText, key: I.KeyRound, history: I.History,
  store: I.Store, megaphone: I.Megaphone, coins: I.HandCoins, sprout: I.Sprout, warehouse: I.Warehouse,
} as const;

function isActive(pathname: string, href: string, exact?: boolean) {
  return exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");
}

/** Customer & gardener portals: side nav on desktop, horizontal tabs (customer) or bottom bar (gardener) on mobile. */
export function PortalNav({ items, rootHref, mobile = "tabs" }: { items: NavItem[]; rootHref: string; mobile?: "tabs" | "bottom" }) {
  const pathname = usePathname();
  const primary = items.slice(0, 5);
  return (
    <>
      <nav aria-label="Account" className="hidden lg:block">
        <ul className="space-y-0.5">
          {items.map((n) => {
            const Ico = ICONS[n.icon];
            const active = isActive(pathname, n.href, n.href === rootHref);
            return (
              <li key={n.href}>
                <Link href={n.href} aria-current={active ? "page" : undefined} className={cn("flex items-center gap-3 rounded-md px-3 py-2 text-[14.5px] font-medium", active ? "bg-forest-50 text-forest-800" : "text-ink-soft hover:bg-sand-100 hover:text-ink")}>
                  <Ico className="h-[18px] w-[18px]" aria-hidden />
                  <span className="flex-1">{n.label}</span>
                  {!!n.badge && <span className="rounded-full bg-clay-500 px-1.5 text-[11px] font-bold text-white">{n.badge}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      {mobile === "tabs" ? (
        <nav aria-label="Account sections" className="scrollbar-none -mx-4 mb-6 flex gap-1 overflow-x-auto border-b border-sand-200 px-4 lg:hidden">
          {items.map((n) => {
            const active = isActive(pathname, n.href, n.href === rootHref);
            return <Link key={n.href} href={n.href} className={cn("shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium", active ? "border-forest-600 text-forest-800" : "border-transparent text-ink-soft")}>{n.label}{n.badge ? ` (${n.badge})` : ""}</Link>;
          })}
        </nav>
      ) : (
        <nav aria-label="Gardener" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-sand-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden">
          {primary.map((n) => {
            const Ico = ICONS[n.icon];
            const active = isActive(pathname, n.href, n.href === rootHref);
            return (
              <Link key={n.href} href={n.href} className={cn("relative flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium", active ? "text-forest-700" : "text-ink-muted")}>
                <Ico className="h-5 w-5" aria-hidden />
                {n.label.split(" ")[0]}
                {!!n.badge && <span className="absolute right-[28%] top-1.5 h-2 w-2 rounded-full bg-clay-500" />}
              </Link>
            );
          })}
        </nav>
      )}
    </>
  );
}

/** Admin: collapsible grouped sidebar with mobile drawer. */
export function AdminSidebar({ items, companyName }: { items: NavItem[]; companyName: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);
  const groups = [...new Set(items.map((i) => i.group ?? ""))];
  const nav = (
    <nav aria-label="Admin" className="flex-1 overflow-y-auto px-3 py-4">
      {groups.map((g) => (
        <div key={g} className="mb-4">
          {g && <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-forest-300/70">{g}</p>}
          <ul className="space-y-0.5">
            {items.filter((i) => (i.group ?? "") === g).map((n) => {
              const Ico = ICONS[n.icon];
              const active = isActive(pathname, n.href, n.href === "/admin");
              return (
                <li key={n.href}>
                  <Link href={n.href} aria-current={active ? "page" : undefined} className={cn("flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm", active ? "bg-forest-800 font-semibold text-white" : "text-forest-100/85 hover:bg-forest-900 hover:text-white")}>
                    <Ico className="h-4 w-4" aria-hidden /><span className="flex-1">{n.label}</span>
                    {!!n.badge && <span className="rounded-sm bg-amber-500 px-1.5 text-[11px] font-bold text-ink">{n.badge}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col bg-forest-950 lg:flex">
        <div className="flex h-14 items-center border-b border-forest-900 px-5"><Logo name={companyName} href="/admin" light className="[&>span]:text-base" /></div>
        {nav}
      </aside>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-sand-100 lg:hidden" aria-label="Open menu"><I.Menu className="h-5 w-5" /></button>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col bg-forest-950">
            <div className="flex h-14 items-center justify-between border-b border-forest-900 px-5">
              <Logo name={companyName} href="/admin" light className="[&>span]:text-base" />
              <button type="button" onClick={() => setOpen(false)} className="text-forest-100" aria-label="Close menu"><I.X className="h-5 w-5" /></button>
            </div>
            {nav}
          </aside>
        </div>
      )}
    </>
  );
}
