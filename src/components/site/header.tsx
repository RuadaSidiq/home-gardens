import { getSiteContext } from "@/server/site";
import { Logo } from "./logo";
import { HeaderNav } from "./header-client";

export async function SiteHeader() {
  const ctx = await getSiteContext();
  const portal = ctx.user ? (ctx.user.isStaff ? "/admin" : ctx.user.gardenerId ? "/gardener/dashboard" : "/account") : null;
  return (
    <>
      {ctx.announcement && (
        <div className="bg-forest-900 px-4 py-2 text-center text-[13px] font-medium text-forest-50">{ctx.announcement}</div>
      )}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/90">
        <div className="container flex h-[76px] items-center justify-between gap-4">
          <Logo name={ctx.settings.company.name} />
          <HeaderNav cartCount={ctx.cartCount} currency={ctx.currency} unread={ctx.unread} phone={ctx.settings.company.phone} user={ctx.user ? { name: ctx.user.fullName, portal } : null} />
        </div>
      </header>
    </>
  );
}
