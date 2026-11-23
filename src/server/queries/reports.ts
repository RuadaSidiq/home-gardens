import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import type { Range } from "./admin";

const r = (range: Range) => ({ from: range.from.toISOString(), to: range.to.toISOString() });

export type ReportTable = { title: string; columns: string[]; rows: (string | number)[][]; money?: number[] };

/** Every report returns a plain table so it can be rendered or exported as CSV. Money columns are minor units. */
export async function runReport(type: string, range: Range): Promise<ReportTable> {
  const { from, to } = r(range);
  switch (type) {
    case "financial": {
      const rows = await db.execute<{ account: string; currency: string; amount: number }>(sql`
        select account, currency, sum(amount)::bigint as amount from ledger_entries
        where created_at >= ${from}::timestamptz and created_at < ${to}::timestamptz group by 1, 2 order by 1, 2`);
      return { title: "Financial summary by ledger account", columns: ["Account", "Currency", "Amount"], money: [2], rows: rows.map((x) => [x.account, x.currency, Number(x.amount)]) };
    }
    case "revenue": {
      const rows = await db.execute<{ day: string; stream: string; currency: string; amount: number }>(sql`
        select to_char(created_at at time zone 'UTC', 'YYYY-MM-DD') as day, coalesce(revenue_stream,'other') as stream, currency, sum(amount)::bigint as amount
        from ledger_entries where account in ('gross_receipts','refunds') and created_at >= ${from}::timestamptz and created_at < ${to}::timestamptz group by 1,2,3 order by 1,2`);
      return { title: "Collected revenue (net of refunds) by day", columns: ["Date", "Stream", "Currency", "Amount"], money: [3], rows: rows.map((x) => [x.day, x.stream, x.currency, Number(x.amount)]) };
    }
    case "bookings": {
      const rows = await db.execute<{ service: string; status: string; n: number; total: number; currency: string }>(sql`
        select s.name as service, b.status, count(*)::int as n, sum(b.total)::bigint as total, b.currency from bookings b join services s on s.id = b.service_id
        where b.created_at >= ${from}::timestamptz and b.created_at < ${to}::timestamptz group by 1,2,5 order by 1,2`);
      return { title: "Bookings by service and status", columns: ["Service", "Status", "Bookings", "Booked value", "Currency"], money: [3], rows: rows.map((x) => [x.service, x.status, x.n, Number(x.total), x.currency]) };
    }
    case "orders": {
      const rows = await db.execute<{ status: string; n: number; total: number; currency: string }>(sql`
        select status, count(*)::int as n, sum(total)::bigint as total, currency from orders where created_at >= ${from}::timestamptz and created_at < ${to}::timestamptz group by 1, 4 order by 1`);
      return { title: "Orders by status", columns: ["Status", "Orders", "Value", "Currency"], money: [2], rows: rows.map((x) => [x.status, x.n, Number(x.total), x.currency]) };
    }
    case "products": {
      const rows = await db.execute<{ name: string; sku: string; qty: number; returned: number; revenue: number; currency: string }>(sql`
        select oi.name, oi.sku, sum(oi.quantity)::int as qty, sum(oi.returned_quantity)::int as returned, sum(oi.line_total)::bigint as revenue, o.currency
        from order_items oi join orders o on o.id = oi.order_id where o.paid_at is not null and o.paid_at >= ${from}::timestamptz and o.paid_at < ${to}::timestamptz
        group by 1,2,6 order by 5 desc limit 100`);
      return { title: "Top products (paid orders)", columns: ["Product", "SKU", "Units", "Returned", "Revenue", "Currency"], money: [4], rows: rows.map((x) => [x.name, x.sku, x.qty, x.returned, Number(x.revenue), x.currency]) };
    }
    case "gardeners": {
      const rows = await db.execute<{ name: string; type: string; completed: number; offered: number; accepted: number; rating: string; reviews: number; earned: number; currency: string }>(sql`
        select u.full_name as name, g.type,
          (select count(*) from bookings b where b.gardener_id = g.id and b.status = 'completed' and b.completed_at >= ${from}::timestamptz and b.completed_at < ${to}::timestamptz)::int as completed,
          (select count(*) from booking_assignments a where a.gardener_id = g.id and a.status <> 'withdrawn' and a.created_at >= ${from}::timestamptz and a.created_at < ${to}::timestamptz)::int as offered,
          (select count(*) from booking_assignments a where a.gardener_id = g.id and a.status = 'accepted' and a.created_at >= ${from}::timestamptz and a.created_at < ${to}::timestamptz)::int as accepted,
          g.rating_avg::text as rating, g.rating_count as reviews,
          (select coalesce(sum(c.gardener_amount),0) from commissions c where c.gardener_id = g.id and c.status <> 'reversed' and c.created_at >= ${from}::timestamptz and c.created_at < ${to}::timestamptz)::bigint as earned,
          g.currency
        from gardener_profiles g join users u on u.id = g.user_id where g.status = 'approved' order by 3 desc`);
      return { title: "Gardener performance", columns: ["Gardener", "Type", "Jobs completed", "Offers", "Accepted", "Acceptance %", "Rating", "Reviews", "Earnings", "Currency"], money: [8], rows: rows.map((x) => [x.name, x.type, x.completed, x.offered, x.accepted, x.offered ? Math.round((x.accepted / x.offered) * 100) : "", Number(x.rating), x.reviews, Number(x.earned), x.currency]) };
    }
    case "commissions": {
      const rows = await db.execute<{ category: string; n: number; gross: number; commission: number; gardener: number; currency: string }>(sql`
        select sc.name as category, count(*)::int as n, sum(c.gross_amount)::bigint as gross, sum(c.commission_amount)::bigint as commission, sum(c.gardener_amount)::bigint as gardener, c.currency
        from commissions c join bookings b on b.id = c.booking_id join services s on s.id = b.service_id join service_categories sc on sc.id = s.category_id
        where c.status <> 'reversed' and c.created_at >= ${from}::timestamptz and c.created_at < ${to}::timestamptz group by 1, 6 order by 4 desc`);
      return { title: "Commission by service category", columns: ["Category", "Jobs", "Net job value", "Commission", "Gardener share", "Currency"], money: [2, 3, 4], rows: rows.map((x) => [x.category, x.n, Number(x.gross), Number(x.commission), Number(x.gardener), x.currency]) };
    }
    case "customers": {
      const rows = await db.execute<{ week: string; signups: number; booked: number; ordered: number }>(sql`
        select to_char(date_trunc('week', u.created_at), 'YYYY-MM-DD') as week, count(*)::int as signups,
          count(*) filter (where exists (select 1 from bookings b where b.customer_id = u.id))::int as booked,
          count(*) filter (where exists (select 1 from orders o where o.user_id = u.id and o.paid_at is not null))::int as ordered
        from users u where u.created_at >= ${from}::timestamptz and u.created_at < ${to}::timestamptz
          and exists (select 1 from user_roles ur join roles ro on ro.id = ur.role_id where ur.user_id = u.id and ro.key = 'customer')
        group by 1 order by 1`);
      return { title: "Customer acquisition by week", columns: ["Week starting", "Sign-ups", "Have booked", "Have ordered", "Conversion %"], rows: rows.map((x) => [x.week, x.signups, x.booked, x.ordered, x.signups ? Math.round((Math.max(x.booked, x.ordered) / x.signups) * 100) : 0]) };
    }
    default:
      throw new Error("Unknown report");
  }
}

export const REPORTS = [
  ["financial", "Financial summary"], ["revenue", "Revenue"], ["bookings", "Bookings"], ["orders", "Orders"],
  ["products", "Products"], ["gardeners", "Gardener performance"], ["commissions", "Commissions"], ["customers", "Customer acquisition"],
] as const;
