import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/server/auth/session";
import { providersFor } from "@/server/payments/registry";
import { Alert, Card, EmptyState, PageHeader, StatusBadge } from "@/components/ui/primitives";
import { ActionButton } from "@/components/ui/form";
import { ButtonLink } from "@/components/ui/button";
import { PaymentPanel } from "@/components/portal/payment-panel";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/utils";
import { cancelMyRegistration } from "../actions";

export const metadata = { title: "My activities" };

export default async function MyActivities({ searchParams }: { searchParams: Promise<{ registered?: string; payment?: string }> }) {
  const u = await requireUser();
  const sp = await searchParams;
  const rows = await db
    .select({ r: schema.activityRegistrations, s: schema.activitySessions, a: schema.activities, providers: schema.countries.paymentProviders })
    .from(schema.activityRegistrations)
    .innerJoin(schema.activitySessions, eq(schema.activitySessions.id, schema.activityRegistrations.sessionId))
    .innerJoin(schema.activities, eq(schema.activities.id, schema.activitySessions.activityId))
    .innerJoin(schema.countries, eq(schema.countries.code, schema.activities.countryCode))
    .where(eq(schema.activityRegistrations.userId, u.id))
    .orderBy(desc(schema.activitySessions.startsAt));
  return (
    <>
      <PageHeader title="Activities" actions={<ButtonLink href="/activities" size="sm" variant="outline">Browse activities</ButtonLink>} />
      {sp.registered && <Alert tone="success" className="mb-4">You're registered. {rows.find((r) => r.r.id === sp.registered)?.r.status === "pending_payment" ? "Complete payment within 30 minutes to keep your seats." : ""}</Alert>}
      {sp.payment === "success" && <Alert tone="success" className="mb-4">Payment confirmed – see you there!</Alert>}
      {rows.length === 0 ? <EmptyState title="No registrations yet" action={<ButtonLink href="/activities" size="sm">Find an activity</ButtonLink>} /> : (
        <div className="space-y-4">
          {rows.map(({ r, s, a, providers }) => (
            <Card key={r.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><Link href={`/activities/${a.slug}`} className="text-lg font-semibold hover:text-forest-700">{a.title}</Link><p className="text-sm text-ink-muted">{formatDateTime(s.startsAt)} · {a.venue}</p><p className="mt-1 text-sm">{r.quantity} seat(s) · {r.amount ? formatMoney(r.amount, r.currency) : "Free"} · Ref {r.reference}</p></div>
                <StatusBadge status={s.status === "cancelled" ? "cancelled" : r.status} label={s.status === "cancelled" ? "Session cancelled" : undefined} />
              </div>
              {r.status === "pending_payment" && (
                <div className="mt-4 max-w-md"><PaymentPanel purpose="activity" subjectId={r.id} currency={r.currency} providers={providersFor(providers, r.currency).map((p) => ({ key: p.key, label: p.label, description: p.description }))} full={r.amount} /></div>
              )}
              {["pending_payment", "confirmed"].includes(r.status) && s.startsAt > new Date() && (
                <div className="mt-4"><ActionButton action={cancelMyRegistration} fields={{ registrationId: r.id }} variant="ghost" confirm="Cancel this registration?">Cancel registration</ActionButton></div>
              )}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
