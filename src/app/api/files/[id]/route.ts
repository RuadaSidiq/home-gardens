import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getCurrentUser } from "@/server/auth/session";
import { readStored } from "@/server/storage";
import { audit } from "@/server/audit";

/** Private files (identity documents, certificates). Owner or staff with gardener review rights only. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Not found", { status: 404 });
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const [f] = await db.select().from(schema.files).where(eq(schema.files.id, id));
  if (!f) return new Response("Not found", { status: 404 });
  const isOwner = f.ownerId === user.id;
  const isReviewer = user.permissions.has("gardeners.review") || user.permissions.has("gardeners.view");
  if (!isOwner && !isReviewer) return new Response("Not found", { status: 404 });
  const buf = await readStored(f.key, f.visibility);
  if (!buf) return new Response("Not found", { status: 404 });
  if (!isOwner) await audit({ actorId: user.id, action: "file.view", entityType: "file", entityId: f.id, meta: { purpose: f.purpose } });
  return new Response(new Uint8Array(buf), {
    headers: { "content-type": f.mime, "cache-control": "private, no-store", "content-disposition": `inline; filename="document.${f.mime === "application/pdf" ? "pdf" : "jpg"}"`, "x-content-type-options": "nosniff" },
  });
}
