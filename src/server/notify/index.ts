import "server-only";
import { eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { DEFAULT_TEMPLATES } from "./templates";
import { sendEmail, sendSms, sendWhatsApp } from "./channels";
import { reportError } from "../errors";
import type { Permission } from "../auth/permissions";

export function render(tpl: string, vars: Record<string, string | number | null | undefined>) {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k] ?? ""));
}

const companyName = () => "Home Gardens";

async function loadTemplate(key: string) {
  const [row] = await db.select().from(schema.notificationTemplates).where(eq(schema.notificationTemplates.key, key)).limit(1);
  if (row) return row.active ? row : null;
  const d = DEFAULT_TEMPLATES[key];
  return d ? { key, ...d, sms: d.sms ?? null, active: true } : null;
}

/**
 * Persist an in-app notification and deliver through the template's channels,
 * respecting the user's preferences. Never throws – failures are recorded.
 */
export async function notify(userId: string, key: string, vars: Record<string, string | number | null | undefined>, link?: string) {
  try {
    const tpl = await loadTemplate(key);
    if (!tpl) return;
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
    if (!user) return;
    const v = { company: companyName(), name: user.fullName.split(" ")[0], ...vars };
    const title = render(tpl.subject, v);
    const body = render(tpl.body, v);
    let notificationId: string | null = null;
    if (tpl.channels.includes("in_app")) {
      const [n] = await db.insert(schema.notifications).values({ userId, type: key, title, body, link: link ?? null }).returning({ id: schema.notifications.id });
      notificationId = n!.id;
    }
    const prefs = user.notificationPrefs;
    const appUrl = process.env.APP_URL ?? "http://localhost:3000";
    const deliveries: (typeof schema.notificationDeliveries.$inferInsert)[] = [];
    // transactional emails (verify/reset) always go out regardless of preferences
    const mandatory = key === "verify_email" || key === "password_reset";
    if (tpl.channels.includes("email") && (prefs.email || mandatory)) {
      const text = body + (link && !body.includes("http") ? `\n\n${appUrl}${link}` : "");
      const r = await sendEmail(user.email, title, text, emailHtml(title, text));
      deliveries.push({ notificationId, userId, channel: "email", recipient: user.email, ...r });
    }
    if (tpl.channels.includes("sms") && prefs.sms && user.phone) {
      const r = await sendSms(user.phone, render(tpl.sms ?? body, v).slice(0, 320));
      deliveries.push({ notificationId, userId, channel: "sms", recipient: user.phone, ...r });
    }
    if (tpl.channels.includes("whatsapp") && prefs.whatsapp && user.phone) {
      const r = await sendWhatsApp(user.phone, body);
      deliveries.push({ notificationId, userId, channel: "whatsapp", recipient: user.phone, ...r });
    }
    if (deliveries.length) await db.insert(schema.notificationDeliveries).values(deliveries);
  } catch (e) {
    await reportError(e, { where: "notify", key, userId });
  }
}

/** Notify every active staff member holding a permission. */
export async function notifyStaff(permission: Permission, title: string, body: string, link?: string) {
  const rows = await db.execute<{ user_id: string }>(sql`
    select distinct ur.user_id from user_roles ur
    join role_permissions rp on rp.role_id = ur.role_id
    join permissions p on p.id = rp.permission_id
    join users u on u.id = ur.user_id
    where p.key = ${permission} and u.status = 'active'`);
  const ids = rows.map((r) => r.user_id);
  if (!ids.length) return;
  await db.insert(schema.notifications).values(ids.map((userId) => ({ userId, type: "staff_alert", title, body, link: link ?? null })));
}

export async function markRead(userId: string, ids?: string[]) {
  const q = db.update(schema.notifications).set({ readAt: new Date() });
  if (ids?.length) await q.where(sql`${schema.notifications.userId} = ${userId} and ${inArray(schema.notifications.id, ids)}`);
  else await q.where(sql`${schema.notifications.userId} = ${userId} and ${schema.notifications.readAt} is null`);
}

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function emailHtml(title: string, text: string) {
  const body = esc(text).replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" style="color:#14713b">$1</a>').replace(/\n/g, "<br>");
  return `<!doctype html><html><body style="margin:0;background:#f6f4ef;font-family:Arial,sans-serif;color:#17231c">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border:1px solid #e4e0d6;border-radius:8px">
<tr><td style="padding:24px 28px;border-bottom:1px solid #eee;font-weight:bold;color:#14713b;font-size:18px">Home Gardens</td></tr>
<tr><td style="padding:28px"><h1 style="font-size:20px;margin:0 0 16px">${esc(title)}</h1><p style="font-size:15px;line-height:1.6;margin:0">${body}</p></td></tr>
</table></td></tr></table></body></html>`;
}
