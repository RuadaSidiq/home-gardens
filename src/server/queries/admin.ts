import "server-only";
import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { getRate } from "../currency";

export type Range = { from: Date; to: Date; days: number; key: string };

export function parseRange(key?: string, fromStr?: string, toStr?: string): Range {
  const now = new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  if (key === "custom" && fromStr && toStr && /^\d{4}-\d{2}-\d{2}$/.test(fromStr) && /^\d{4}-\d{2}-\d{2}$/.test(toStr)) {
    const from = new Date(fromStr + "T00:00:00Z"), to = new Date(toStr + "T00:00:00Z");
    to.setUTCDate(to.getUTCDate() + 1);
    const days = Math.max(1, Math.min(366, Math.round((to.getTime() - from.getTime()) / 86400_000)));
    return { from, to: new Date(from.getTime() + days * 86400_000), days, key };
  }
  const days = key === "7d" ? 7 : key === "90d" ? 90 : key === "365d" ? 365 : 30;
  return { from: new Date(end.getTime() - days * 86400_000), to: end, days, key: key ?? "30d" };
}

/** Converts per-currency sums to the base currency at current rates. */
async function toBase(rows: { currency: string; amount: number }[], base: string) {
  let total = 0;
  for (const r of rows) total += Math.round(r.amount * (await getRate(r.currency, base)));
  return total;
}

export async function dashboardMetrics(range: Range, base: string) {
  const inRange = (col: typeof schema.ledgerEntries.createdAt) => and(gte(col, range.from), lt(col, range.to));
  const byStream = await db
    .select({ stream: schema.ledgerEntries.revenueStream, account: schema.ledgerEntries.account, currency: schema.ledgerEntries.currency, amount: sql<number>`sum(${schema.ledgerEntries.amount})`.mapWith(Number) })
    .from(schema.ledgerEntries)
    .where(and(inRange(schema.ledgerEntries.createdAt), sql`${schema.ledgerEntries.account} in ('gross_receipts','refunds','company_revenue')`))
    .groupBy(schema.ledgerEntries.revenueStream, schema.ledgerEntries.account, schema.ledgerEntries.currency);
  const sum = async (pred: (r: (typeof byStream)[number]) => boolean) => toBase(byStream.filter(pred), base);
  const collected = await sum((r) => r.account === "gross_receipts" || r.account === "refunds");
  const streams = {
    services: await sum((r) => r.stream === "services" && (r.account === "gross_receipts" || r.account === "refunds")),
    products: await sum((r) => r.stream === "products" && (r.account === "gross_receipts" || r.account === "refunds")),
    activities: await sum((r) => r.stream === "activities" && (r.account === "gross_receipts" || r.account === "refunds")),
  };
  const companyRevenue = await sum((r) => r.account === "company_revenue");

  const [b] = await db
    .select({
      total: sql<number>`count(*)`.mapWith(Number),
      pending: sql<number>`count(*) filter (where status in ('awaiting_quote','quoted','awaiting_payment','pending_assignment','assigned'))`.mapWith(Number),
      completed: sql<number>`count(*) filter (where status = 'completed')`.mapWith(Number),
      cancelled: sql<number>`count(*) filter (where status = 'cancelled')`.mapWith(Number),
      disputed: sql<number>`count(*) filter (where status = 'disputed')`.mapWith(Number),
    })
    .from(schema.bookings)
    .where(and(gte(schema.bookings.createdAt, range.from), lt(schema.bookings.createdAt, range.to)));
  const [o] = await db
    .select({ total: sql<number>`count(*)`.mapWith(Number), pending: sql<number>`count(*) filter (where status in ('pending_payment','paid','processing'))`.mapWith(Number) })
    .from(schema.orders)
    .where(and(gte(schema.orders.createdAt, range.from), lt(schema.orders.createdAt, range.to)));
  const [people] = await db
    .select({
      customers: sql<number>`(select count(distinct ur.user_id) from user_roles ur join roles r on r.id = ur.role_id where r.key = 'customer')`.mapWith(Number),
      newCustomers: sql<number>`(select count(*) from users u where u.created_at >= ${range.from.toISOString()}::timestamptz and exists (select 1 from user_roles ur join roles r on r.id = ur.role_id where ur.user_id = u.id and r.key='customer'))`.mapWith(Number),
      activeGardeners: sql<number>`(select count(*) from gardener_profiles where status = 'approved')`.mapWith(Number),
      pendingApplications: sql<number>`(select count(*) from gardener_profiles where status in ('pending','info_requested'))`.mapWith(Number),
      payoutRequests: sql<number>`(select count(*) from payouts where status in ('requested','approved'))`.mapWith(Number),
      manualPending: sql<number>`(select count(*) from payments where provider = 'manual' and status = 'pending')`.mapWith(Number),
      openTickets: sql<number>`(select count(*) from support_tickets where status = 'open')`.mapWith(Number),
      lowStock: sql<number>`(select count(*) from (select p.id from products p join product_variants v on v.product_id = p.id left join inventory i on i.variant_id = v.id where p.active and v.active group by p.id, v.id, p.low_stock_threshold having coalesce(sum(i.on_hand),0) <= p.low_stock_threshold) x)`.mapWith(Number),
    })
    .from(sql`(select 1) one`);
  const owed = await db
    .select({ currency: schema.gardenerWallets.currency, amount: sql<number>`sum(${schema.gardenerWallets.availableBalance} + ${schema.gardenerWallets.reservedBalance} + ${schema.gardenerWallets.pendingBalance})`.mapWith(Number) })
    .from(schema.gardenerWallets)
    .groupBy(schema.gardenerWallets.currency);
  return { collected, streams, companyRevenue, bookings: b!, orders: o!, people: people!, outstandingPayouts: await toBase(owed, base) };
}

/** Daily (or weekly for long ranges) series of collected revenue by stream, in base currency. */
export async function revenueSeries(range: Range, base: string) {
  const bucket = range.days > 92 ? "week" : "day";
  const rows = await db.execute<{ b: string; stream: string | null; currency: string; amount: number }>(sql`
    select to_char(date_trunc(${bucket}, created_at at time zone 'UTC'), 'YYYY-MM-DD') as b, revenue_stream as stream, currency, sum(amount)::bigint as amount
    from ledger_entries
    where account in ('gross_receipts','refunds') and created_at >= ${range.from.toISOString()}::timestamptz and created_at < ${range.to.toISOString()}::timestamptz
    group by 1, 2, 3`);
  const labels = bucketLabels(range, bucket);
  const rates = new Map<string, number>();
  for (const r of rows) if (!rates.has(r.currency)) rates.set(r.currency, await getRate(r.currency, base));
  const mk = (stream: string) => labels.keys.map((k) => rows.filter((r) => r.b === k && r.stream === stream).reduce((s, r) => s + Math.round(Number(r.amount) * rates.get(r.currency)!), 0));
  return { labels: labels.display, series: [{ name: "Services", values: mk("services") }, { name: "Products", values: mk("products") }, { name: "Activities", values: mk("activities") }] };
}

export async function bookingSeries(range: Range) {
  const bucket = range.days > 92 ? "week" : "day";
  const rows = await db.execute<{ b: string; n: number }>(sql`
    select to_char(date_trunc(${bucket}, created_at at time zone 'UTC'), 'YYYY-MM-DD') as b, count(*)::int as n
    from bookings where created_at >= ${range.from.toISOString()}::timestamptz and created_at < ${range.to.toISOString()}::timestamptz group by 1`);
  const labels = bucketLabels(range, bucket);
  return { labels: labels.display, series: [{ name: "Bookings", values: labels.keys.map((k) => Number(rows.find((r) => r.b === k)?.n ?? 0)) }] };
}

function bucketLabels(range: Range, bucket: "day" | "week") {
  const keys: string[] = [];
  const display: string[] = [];
  const d = new Date(range.from);
  if (bucket === "week") {
    const day = d.getUTCDay();
    d.setUTCDate(d.getUTCDate() - ((day + 6) % 7));
  }
  while (d < range.to) {
    keys.push(d.toISOString().slice(0, 10));
    display.push(d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }));
    d.setUTCDate(d.getUTCDate() + (bucket === "week" ? 7 : 1));
  }
  return { keys, display };
}

/** Collected service revenue by service category + product sales by product category (base currency). */
export async function revenueByCategory(range: Range, base: string) {
  const svc = await db.execute<{ label: string; currency: string; amount: number }>(sql`
    select c.name as label, l.currency, sum(l.amount)::bigint as amount from ledger_entries l
    join bookings b on b.id = l.booking_id join services s on s.id = b.service_id join service_categories c on c.id = s.category_id
    where l.account in ('gross_receipts','refunds') and l.created_at >= ${range.from.toISOString()}::timestamptz and l.created_at < ${range.to.toISOString()}::timestamptz
    group by 1, 2`);
  const prod = await db.execute<{ label: string; currency: string; amount: number }>(sql`
    select pc.name as label, o.currency, sum(oi.line_total - oi.returned_quantity * oi.unit_price)::bigint as amount from order_items oi
    join orders o on o.id = oi.order_id join products p on p.id = oi.product_id join product_categories pc on pc.id = p.category_id
    where o.paid_at is not null and o.status not in ('cancelled','refunded') and o.paid_at >= ${range.from.toISOString()}::timestamptz and o.paid_at < ${range.to.toISOString()}::timestamptz
    group by 1, 2`);
  const fold = async (rows: { label: string; currency: string; amount: number }[]) => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.label, (m.get(r.label) ?? 0) + Math.round(Number(r.amount) * (await getRate(r.currency, base))));
    return [...m.entries()].map(([label, value]) => ({ label, value })).filter((r) => r.value > 0).sort((a, b) => b.value - a.value).slice(0, 8);
  };
  return { services: await fold(svc), products: await fold(prod) };
}

export async function recentActivity() {
  const [payments, bookings, orders] = await Promise.all([
    db.select({ p: schema.payments, user: schema.users.fullName }).from(schema.payments).innerJoin(schema.users, eq(schema.users.id, schema.payments.userId)).where(sql`${schema.payments.status} <> 'initiated'`).orderBy(desc(schema.payments.createdAt)).limit(6),
    db.select({ b: schema.bookings, service: schema.services.name, customer: schema.users.fullName }).from(schema.bookings).innerJoin(schema.services, eq(schema.services.id, schema.bookings.serviceId)).innerJoin(schema.users, eq(schema.users.id, schema.bookings.customerId)).orderBy(desc(schema.bookings.createdAt)).limit(6),
    db.select({ o: schema.orders, customer: schema.users.fullName }).from(schema.orders).innerJoin(schema.users, eq(schema.users.id, schema.orders.userId)).orderBy(desc(schema.orders.createdAt)).limit(6),
  ]);
  return { payments, bookings, orders };
}
