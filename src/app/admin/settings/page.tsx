import Link from "next/link";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePermission } from "@/server/auth/session";
import { getSettings } from "@/server/settings";
import { providerStatus } from "@/server/payments/registry";
import { channelStatus } from "@/server/notify/channels";
import { Badge, Card, CardHeader, PageHeader } from "@/components/ui/primitives";
import { BookingForm, CommerceForm, CompanyForm, FinanceForm, SocialForm } from "./forms";

export const metadata = { title: "Settings" };

export default async function Settings() {
  await requirePermission("settings.manage");
  const [s, warehouses, currencies] = await Promise.all([getSettings(), db.select({ code: schema.warehouses.code }).from(schema.warehouses).where(eq(schema.warehouses.active, true)), db.select({ code: schema.currencies.code }).from(schema.currencies).where(eq(schema.currencies.active, true))]);
  const ch = channelStatus();
  const integrations: [string, boolean, string][] = [
    ...providerStatus().map((p) => [`Payments: ${p.key}`, p.configured, p.configured ? "Configured" : "Set credentials in environment"] as [string, boolean, string]),
    ["Email", !!ch.email, ch.email ?? "Set SMTP_* or RESEND_API_KEY"], ["SMS", !!ch.sms, ch.sms ?? "Set HUBTEL_SMS_* or TWILIO_*"], ["WhatsApp", !!ch.whatsapp, ch.whatsapp ?? "Set WHATSAPP_*"],
    ["AI garden assistant", !!process.env.ANTHROPIC_API_KEY, process.env.ANTHROPIC_API_KEY ? `Model ${process.env.AI_MODEL ?? "default"}` : "Set ANTHROPIC_API_KEY"],
    ["File storage", true, process.env.STORAGE_DRIVER === "s3" ? "S3-compatible bucket" : "Local disk (single server only)"],
    ["Error reporting", !!process.env.ERROR_WEBHOOK_URL, process.env.ERROR_WEBHOOK_URL ? "Webhook" : "Console only – set ERROR_WEBHOOK_URL"],
    ["Scheduled maintenance", !!process.env.CRON_SECRET, process.env.CRON_SECRET ? "Secret set – schedule /api/cron/maintenance" : "Set CRON_SECRET"],
  ];
  return (
    <>
      <PageHeader title="Settings" actions={<Link href="/admin/settings/account" className="text-sm link">My account & security</Link>} />
      <div className="space-y-6">
        <Card><CardHeader title="Integrations" description="Secrets are configured as environment variables on the server, never in the database or browser." /><ul className="grid gap-px bg-sand-200 sm:grid-cols-2 lg:grid-cols-3">{integrations.map(([n, ok, d]) => <li key={n} className="flex items-start justify-between gap-2 bg-white p-4 text-sm"><span><span className="font-medium">{n}</span><span className="block text-xs text-ink-muted">{d}</span></span>{ok ? <Badge tone="green">Ready</Badge> : <Badge>Off</Badge>}</li>)}</ul></Card>
        <Card><CardHeader title="Company" /><div className="p-5"><CompanyForm v={s.company} /></div></Card>
        <Card><CardHeader title="Bookings" /><div className="p-5"><BookingForm v={s.booking} /></div></Card>
        <Card><CardHeader title="Shop" /><div className="p-5"><CommerceForm v={s.commerce} warehouses={warehouses.map((w) => w.code)} /></div></Card>
        <Card><CardHeader title="Finance" /><div className="p-5"><FinanceForm v={s.finance} currencies={currencies.map((c) => c.code)} /></div></Card>
        <Card><CardHeader title="Social links" /><div className="p-5"><SocialForm v={s.social} /></div></Card>
      </div>
    </>
  );
}
