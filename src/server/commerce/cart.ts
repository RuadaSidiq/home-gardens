import { and, eq, inArray, sql } from "drizzle-orm";
import { db, schema, type DbOrTx } from "@/db";
import { UserError } from "../errors";
import { stockFor } from "./inventory";
import { getRate } from "../currency";
import { convert } from "@/lib/money";

export type CartOwner = { userId: string } | { guestToken: string };

export async function getOrCreateCart(owner: CartOwner, tx: DbOrTx = db) {
  const where = "userId" in owner ? eq(schema.carts.userId, owner.userId) : eq(schema.carts.guestToken, owner.guestToken);
  const [c] = await tx.select().from(schema.carts).where(where);
  if (c) return c;
  const [created] = await tx
    .insert(schema.carts)
    .values("userId" in owner ? { userId: owner.userId } : { guestToken: owner.guestToken })
    .onConflictDoNothing()
    .returning();
  if (created) return created;
  const [again] = await tx.select().from(schema.carts).where(where);
  return again!;
}

export async function findCart(owner: CartOwner) {
  const where = "userId" in owner ? eq(schema.carts.userId, owner.userId) : eq(schema.carts.guestToken, owner.guestToken);
  const [c] = await db.select().from(schema.carts).where(where);
  return c ?? null;
}

export function unitPrice(p: { price: number; salePrice: number | null }, v: { priceOverride: number | null; salePriceOverride: number | null }) {
  const regular = v.priceOverride ?? p.price;
  const sale = v.priceOverride != null ? v.salePriceOverride : (v.salePriceOverride ?? p.salePrice);
  return { regular, sale: sale != null && sale < regular ? sale : null, effective: sale != null && sale < regular ? sale : regular };
}

export type CartLine = {
  variantId: string;
  productId: string;
  slug: string;
  name: string;
  variantName: string;
  sku: string;
  image: string | null;
  quantity: number;
  stock: number;
  allowBackorder: boolean;
  unitPrice: number; // in display currency
  lineTotal: number;
  weightGrams: number;
  vendorId: string;
  productCurrency: string;
  unitPriceBase: number;
};

/** Cart contents with prices converted to `currency`. */
export async function cartLines(cartId: string, currency: string, tx: DbOrTx = db): Promise<CartLine[]> {
  const rows = await tx
    .select({ item: schema.cartItems, v: schema.productVariants, p: schema.products })
    .from(schema.cartItems)
    .innerJoin(schema.productVariants, eq(schema.productVariants.id, schema.cartItems.variantId))
    .innerJoin(schema.products, eq(schema.products.id, schema.productVariants.productId))
    .where(eq(schema.cartItems.cartId, cartId))
    .orderBy(schema.cartItems.addedAt);
  const stock = await stockFor(rows.map((r) => r.v.id), tx);
  const rates = new Map<string, number>();
  const out: CartLine[] = [];
  for (const r of rows) {
    if (!r.p.active || !r.v.active) continue;
    if (!rates.has(r.p.currency)) rates.set(r.p.currency, await getRate(r.p.currency, currency, tx));
    const base = unitPrice(r.p, r.v).effective;
    const unit = convert(base, rates.get(r.p.currency)!);
    out.push({
      variantId: r.v.id,
      productId: r.p.id,
      slug: r.p.slug,
      name: r.p.name,
      variantName: r.v.isDefault ? "" : r.v.name,
      sku: r.v.sku,
      image: r.p.images[0] ?? null,
      quantity: r.item.quantity,
      stock: stock.get(r.v.id) ?? 0,
      allowBackorder: r.p.allowBackorder,
      unitPrice: unit,
      lineTotal: unit * r.item.quantity,
      weightGrams: r.p.weightGrams * r.item.quantity,
      vendorId: r.p.vendorId,
      productCurrency: r.p.currency,
      unitPriceBase: base,
    });
  }
  return out;
}

export async function setCartQuantity(owner: CartOwner, variantId: string, quantity: number, mode: "add" | "set" = "set") {
  if (quantity < 0 || quantity > 99) throw new UserError("Choose a quantity between 1 and 99.");
  const [v] = await db
    .select({ v: schema.productVariants, p: schema.products })
    .from(schema.productVariants)
    .innerJoin(schema.products, eq(schema.products.id, schema.productVariants.productId))
    .where(eq(schema.productVariants.id, variantId));
  if (!v || !v.p.active || !v.v.active) throw new UserError("This product is no longer available.");
  const cart = await getOrCreateCart(owner);
  const [existing] = await db.select().from(schema.cartItems).where(and(eq(schema.cartItems.cartId, cart.id), eq(schema.cartItems.variantId, variantId)));
  const next = mode === "add" ? (existing?.quantity ?? 0) + quantity : quantity;
  if (next <= 0) {
    await db.delete(schema.cartItems).where(and(eq(schema.cartItems.cartId, cart.id), eq(schema.cartItems.variantId, variantId)));
  } else {
    const stock = (await stockFor([variantId])).get(variantId) ?? 0;
    if (!v.p.allowBackorder && next > stock) {
      throw new UserError(stock <= 0 ? "This item is out of stock." : `Only ${stock} left in stock.`);
    }
    await db
      .insert(schema.cartItems)
      .values({ cartId: cart.id, variantId, quantity: Math.min(next, 99) })
      .onConflictDoUpdate({ target: [schema.cartItems.cartId, schema.cartItems.variantId], set: { quantity: Math.min(next, 99) } });
  }
  await db.update(schema.carts).set({ updatedAt: new Date() }).where(eq(schema.carts.id, cart.id));
  return cart;
}

/** Moves a guest cart into the user's persistent cart after sign-in. */
export async function mergeGuestCart(guestToken: string, userId: string) {
  const [guest] = await db.select().from(schema.carts).where(eq(schema.carts.guestToken, guestToken));
  if (!guest) return;
  const userCart = await getOrCreateCart({ userId });
  if (guest.id === userCart.id) return;
  const items = await db.select().from(schema.cartItems).where(eq(schema.cartItems.cartId, guest.id));
  for (const i of items) {
    await db
      .insert(schema.cartItems)
      .values({ cartId: userCart.id, variantId: i.variantId, quantity: i.quantity })
      .onConflictDoUpdate({
        target: [schema.cartItems.cartId, schema.cartItems.variantId],
        set: { quantity: sql`least(${schema.cartItems.quantity} + ${i.quantity}, 99)` },
      });
  }
  await db.delete(schema.carts).where(eq(schema.carts.id, guest.id));
}

export async function cartCount(cartId: string) {
  const [r] = await db.select({ n: sql<number>`coalesce(sum(${schema.cartItems.quantity}),0)`.mapWith(Number) }).from(schema.cartItems).where(eq(schema.cartItems.cartId, cartId));
  return r?.n ?? 0;
}

export async function clearCart(cartId: string, variantIds: string[], tx: DbOrTx = db) {
  if (!variantIds.length) return;
  await tx.delete(schema.cartItems).where(and(eq(schema.cartItems.cartId, cartId), inArray(schema.cartItems.variantId, variantIds)));
}
