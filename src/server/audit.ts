import { db, schema, type DbOrTx } from "@/db";

export async function audit(
  entry: { actorId: string | null; action: string; entityType: string; entityId?: string | null; meta?: Record<string, unknown>; ip?: string | null },
  tx: DbOrTx = db,
) {
  await tx.insert(schema.auditLogs).values({
    actorId: entry.actorId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    meta: entry.meta ?? {},
    ip: entry.ip ?? null,
  });
}
