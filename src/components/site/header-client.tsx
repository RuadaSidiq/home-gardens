"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Menu, X, ShoppingCart, User, ChevronDown, Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { setCurrency } from "@/app/(site)/actions";
import { useRouter } from "next/navigation";

export const NAV = [
  { href: "/services", label: "Services" },
  { href: "/find-a-gardener", label: "Find a gardener" },
  { href: "/activities", label: "Activities" },
  { href: "/shop", label: "Shop" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

export function CurrencySwitcher({ value, compact }: { value: string; compact?: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <label className={cn("relative inline-flex items-center", compact ? "" : "text-sm")}>
      <span className="sr-only">Display currency</span>
      <select
        value={value}
        disabled={pending}
        onChange={(e) => {
          const fd = new FormData();
          fd.set("currency", e.target.value);
          start(async () => {
            await setCurrency(null, fd);
            router.refresh();
          });
        }}
        className="h-9 cursor-pointer appearance-none rounded-md border border-transparent bg-transparent pl-2 pr-6 text-[13px] font-semibold text-ink-soft hover:border-sand-200 focus:border-forest-500 focus:outline-none"
      >
        {["GHS", "USD", "GBP", "EUR", "NGN"].map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      <ChevronDown className="pointer-events-none absolute right-1.5 h-3.5 w-3.5 text-ink-muted" />
    </label>
  );
}

export function HeaderNav({ cartCount, currency, user, unread }: { cartCount: number; currency: string; user: { name: string; portal: string | null } | null; unread: number }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
  }, [open]);
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");
  return (
    <>
      <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} aria-current={isActive(n.href) ? "page" : undefined} className={cn("rounded-md px-3 py-2 text-[14.5px] font-medium transition-colors", isActive(n.href) ? "text-forest-700" : "text-ink-soft hover:text-ink")}>
            {n.label}
          </Link>
        ))}
      </nav>
      <div className="flex items-center gap-1">
        <div className="hidden sm:block"><CurrencySwitcher value={currency} /></div>
        {user && (
          <Link href="/account/notifications" className="relative hidden h-9 w-9 items-center justify-center rounded-md text-ink-soft hover:bg-sand-100 sm:inline-flex" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}>
            <Bell className="h-[19px] w-[19px]" />
            {unread > 0 && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-clay-500" />}
          </Link>
        )}
        <Link href="/cart" className="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-ink-soft hover:bg-sand-100" aria-label={`Cart, ${cartCount} items`}>
          <ShoppingCart className="h-[19px] w-[19px]" />
          {cartCount > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-forest-600 px-1 text-[10px] font-bold text-white">{cartCount}</span>}
        </Link>
        {user ? (
          <Link href={user.portal ?? "/account"} className="ml-1 hidden h-9 items-center gap-2 rounded-md border border-sand-200 px-3 text-sm font-semibold hover:bg-sand-50 sm:inline-flex">
            <User className="h-4 w-4" /> <span className="max-w-[9rem] truncate">{user.name.split(" ")[0]}</span>
          </Link>
        ) : (
          <div className="ml-1 hidden items-center gap-1 sm:flex">
            <Link href="/login" className="rounded-md px-3 py-2 text-sm font-semibold text-ink-soft hover:text-ink">Sign in</Link>
            <Link href="/services" className="inline-flex h-9 items-center rounded-md bg-forest-600 px-4 text-sm font-semibold text-white hover:bg-forest-700">Book a gardener</Link>
          </div>
        )}
        <button type="button" onClick={() => setOpen((o) => !o)} className="inline-flex h-9 w-9 items-center justify-center rounded-md text-ink hover:bg-sand-100 lg:hidden" aria-expanded={open} aria-controls="mobile-menu" aria-label="Menu">
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>
      {open && (
        <div id="mobile-menu" className="fixed inset-x-0 bottom-0 top-16 z-40 overflow-y-auto border-t border-sand-200 bg-white lg:hidden">
          <nav aria-label="Mobile" className="container flex flex-col py-4">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className={cn("border-b border-sand-100 py-3.5 text-lg font-medium", isActive(n.href) ? "text-forest-700" : "text-ink")}>{n.label}</Link>
            ))}
            <Link href="/faq" className="border-b border-sand-100 py-3.5 text-lg font-medium">FAQ</Link>
            <Link href="/become-a-gardener" className="border-b border-sand-100 py-3.5 text-lg font-medium">Become a gardener</Link>
            <div className="mt-6 flex items-center justify-between">
              <span className="text-sm text-ink-muted">Currency</span>
              <CurrencySwitcher value={currency} />
            </div>
            <div className="mt-6 grid gap-2">
              {user ? (
                <Link href={user.portal ?? "/account"} className="inline-flex h-12 items-center justify-center rounded-md bg-ink font-semibold text-white">My account</Link>
              ) : (
                <>
                  <Link href="/services" className="inline-flex h-12 items-center justify-center rounded-md bg-forest-600 font-semibold text-white">Book a gardener</Link>
                  <Link href="/login" className="inline-flex h-12 items-center justify-center rounded-md border border-sand-300 font-semibold">Sign in</Link>
                </>
              )}
            </div>
          </nav>
        </div>
      )}
    </>
  );
}
