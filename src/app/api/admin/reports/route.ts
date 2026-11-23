import { getCurrentUser } from "@/server/auth/session";
import { parseRange } from "@/server/queries/admin";
import { REPORTS, runReport } from "@/server/queries/reports";
import { audit } from "@/server/audit";

function csvCell(v: string | number) {
  const s = String(v);
  // Neutralise spreadsheet formula injection and quote special characters.
  const safe = /^[=+\-@]/.test(s) && typeof v === "string" ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export async function GET(req: Request) {
  const u = await getCurrentUser();
  if (!u?.permissions.has("reports.view")) return new Response("Forbidden", { status: 403 });
  const p = new URL(req.url).searchParams;
  const type = p.get("type") ?? "financial";
  if (!REPORTS.some(([k]) => k === type)) return new Response("Unknown report", { status: 400 });
  const range = parseRange(p.get("range") ?? undefined, p.get("from") ?? undefined, p.get("to") ?? undefined);
  const r = await runReport(type, range);
  // Money columns exported in major units for spreadsheets.
  const rows = r.rows.map((row) => row.map((v, i) => (r.money?.includes(i) ? (Number(v) / 100).toFixed(2) : v)));
  const csv = [r.columns, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
  await audit({ actorId: u.id, action: "report.export", entityType: "settings", entityId: type });
  return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${type}-${range.from.toISOString().slice(0, 10)}.csv"` } });
}
