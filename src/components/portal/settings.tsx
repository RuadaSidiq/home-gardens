import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/server/auth/session";
import { otpauthUrl } from "@/server/auth/totp";
import { Card, CardHeader, PageHeader } from "@/components/ui/primitives";
import { formatDateTime } from "@/lib/utils";
import { logout } from "@/app/(auth)/actions";
import { MfaSection, PasswordForm, PrefsForm, ProfileForm, SessionsButton } from "./settings-forms";

export async function SettingsPage({ children }: { children?: React.ReactNode }) {
  const u = await requireUser();
  const [[row], countries, sessions] = await Promise.all([
    db.select().from(schema.users).where(eq(schema.users.id, u.id)),
    db.select({ code: schema.countries.code, name: schema.countries.name }).from(schema.countries).where(eq(schema.countries.active, true)),
    db.select().from(schema.sessions).where(eq(schema.sessions.userId, u.id)).orderBy(desc(schema.sessions.lastSeenAt)).limit(10),
  ]);
  return (
    <>
      <PageHeader title="Settings" />
      <div className="space-y-6">
        {children}
        <Card><CardHeader title="Profile" /><div className="p-5"><ProfileForm u={row!} countries={countries} /></div></Card>
        <Card><CardHeader title="Notifications" description="Choose how we contact you. Security emails are always sent." /><div className="p-5"><PrefsForm prefs={row!.notificationPrefs} /></div></Card>
        <Card><CardHeader title="Password" /><div className="p-5"><PasswordForm /></div></Card>
        <Card>
          <CardHeader title="Two-step verification" description={u.isStaff ? "Strongly recommended for staff accounts." : "Adds a code from your phone when you sign in."} />
          <div className="p-5"><MfaSection enabled={row!.mfaEnabled} secret={row!.mfaEnabled ? null : row!.mfaSecret} otpauth={row!.mfaSecret && !row!.mfaEnabled ? otpauthUrl(row!.mfaSecret, row!.email, "Home Gardens") : null} /></div>
        </Card>
        <Card>
          <CardHeader title="Signed-in devices" />
          <ul className="divide-y divide-sand-100 text-sm">{sessions.map((s) => <li key={s.id} className="px-5 py-3"><p className="truncate">{s.userAgent ?? "Unknown device"}</p><p className="text-xs text-ink-muted">{s.ip} · last active {formatDateTime(s.lastSeenAt)}</p></li>)}</ul>
          <div className="flex flex-wrap gap-2 border-t border-sand-200 p-5"><SessionsButton /><form action={logout}><button className="inline-flex h-10 items-center rounded-md px-4 text-sm font-semibold text-clay-600 hover:bg-clay-50">Sign out</button></form></div>
        </Card>
      </div>
    </>
  );
}
