import { and, eq, sql } from "drizzle-orm";
import { db, schema, type DbOrTx, type Tx } from "@/db";
import { UserError } from "../errors";

type Reason = (typeof schema.movementReason.enumValues)[number];

export async function defaultWarehouseId(tx: DbOrTx = db) {
  const [w] = await tx.select({ id: schema.warehouses.id }).from(schema.warehouses).where(eq(schema.warehouses.isDefault, true));
  if (!w) throw new Error("No default warehouse configured");
  return w.id;
}

/**
 * Atomically change stock and write a movement record. A negative delta fails if it would
 * take stock below zero, unless backorders are allowed for that call.
 */
export async function adjustStock(
  tx: Tx,
  m: { variantId: string; warehouseId: number; delta: number; reason: Reason; reference?: string; note?: string; actorId?: string | null; allowNegative?: boolean },
) {
  await tx.insert(schema.inventory).values({ variantId: m.variantId, warehouseId: m.warehouseId, onHand: 0 }).onConflictDoNothing();
  const [row] = await tx
    .update(schema.inventory)
    .set({ onHand: sql`${schema.inventory.onHand} + ${m.delta}`, updatedAt: new Date() })
    .where(
      and(
        eq(schema.inventory.variantId, m.variantId),
        eq(schema.inventory.warehouseId, m.warehouseId),
        m.delta < 0 && !m.allowNegative ? sql`${schema.inventory.onHand} + ${m.delta} >= 0` : undefined,
      ),
    )
    .returning({ onHand: schema.inventory.onHand });
  if (!row) throw new UserError("Not enough stock for one of the items in your cart.");
  await tx.insert(schema.inventoryMovements).values({
    variantId: m.variantId,
    warehouseId: m.warehouseId,
    delta: m.delta,
    balanceAfter: row.onHand,
    reason: m.reason,
    reference: m.reference ?? null,
    note: m.note ?? null,
    actorId: m.actorId ?? null,
  });
  return row.onHand;
}

/** Total stock per variant across active warehouses. */
export async function stockFor(variantIds: string[], tx: DbOrTx = db) {
  if (!variantIds.length) return new Map<string, number>();
  const rows = await tx.execute<{ variant_id: string; qty: number }>(sql`
    select i.variant_id, coalesce(sum(i.on_hand), 0)::int as qty
    from inventory i join warehouses w on w.id = i.warehouse_id and w.active
    where i.variant_id in (${sql.join(variantIds.map((v) => sql`${v}`), sql`, `)})
    group by i.variant_id`);
  return new Map(rows.map((r) => [r.variant_id, Number(r.qty)]));
}

/** Picks the warehouse with the most stock for a variant (falls back to default). */
export async function pickWarehouse(tx: DbOrTx, variantId: string, qty: number) {
  const rows = await tx
    .select({ warehouseId: schema.inventory.warehouseId, onHand: schema.inventory.onHand })
    .from(schema.inventory)
    .innerJoin(schema.warehouses, and(eq(schema.warehouses.id, schema.inventory.warehouseId), eq(schema.warehouses.active, true)))
    .where(eq(schema.inventory.variantId, variantId))
    .orderBy(sql`${schema.inventory.onHand} desc`);
  const fit = rows.find((r) => r.onHand >= qty);
  return fit?.warehouseId ?? rows[0]?.warehouseId ?? (await defaultWarehouseId(tx));
}
