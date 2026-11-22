import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { getCurrentUser } from "./auth/session";
import { getSettings, getContent } from "./settings";
import { findCart, cartCount } from "./commerce/cart";

export const CURRENCY_COOKIE = "hg_currency";
export const CART_COOKIE = "hg_cart";
const SUPPORTED = ["GHS", "USD", "GBP", "EUR", "NGN"];

export const getDisplayCurrency = cache(async () => {
  const jar = await cookies();
  const c = jar.get(CURRENCY_COOKIE)?.value;
  if (c && SUPPORTED.includes(c)) return c;
  const u = await getCurrentUser();
  return u?.preferredCurrency ?? "GHS";
});

export const getCartOwner = cache(async () => {
  const u = await getCurrentUser();
  if (u) return { userId: u.id } as const;
  const t = (await cookies()).get(CART_COOKIE)?.value;
  return t ? ({ guestToken: t } as const) : null;
});

export const getSiteContext = cache(async () => {
  const [user, currency, settings, owner] = await Promise.all([getCurrentUser(), getDisplayCurrency(), getSettings(), getCartOwner()]);
  let count = 0;
  if (owner) {
    const cart = await findCart(owner);
    if (cart) count = await cartCount(cart.id);
  }
  let unread = 0;
  if (user) {
    const [r] = await db
      .select({ n: sql<number>`count(*)`.mapWith(Number) })
      .from(schema.notifications)
      .where(and(eq(schema.notifications.userId, user.id), isNull(schema.notifications.readAt)));
    unread = r?.n ?? 0;
  }
  const announcement = await getContent<{ text: string; active: boolean } | null>("site.announcement", null);
  return { user, currency, settings, cartCount: count, unread, announcement: announcement?.active ? announcement.text : null };
});

export const serviceCategoriesNav = cache(async () =>
  db.select().from(schema.serviceCategories).where(eq(schema.serviceCategories.active, true)).orderBy(asc(schema.serviceCategories.sort)),
);

export const productCategoriesNav = cache(async () =>
  db.select().from(schema.productCategories).where(eq(schema.productCategories.active, true)).orderBy(asc(schema.productCategories.sort)),
);
