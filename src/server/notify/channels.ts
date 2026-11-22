import "server-only";
import nodemailer from "nodemailer";

export type ChannelResult = { status: "sent" | "failed" | "skipped"; provider?: string; error?: string };

export const channelStatus = () => ({
  email: process.env.SMTP_HOST ? "SMTP" : process.env.RESEND_API_KEY ? "Resend" : null,
  sms: process.env.HUBTEL_SMS_CLIENT_ID ? "Hubtel" : process.env.TWILIO_ACCOUNT_SID ? "Twilio" : null,
  whatsapp: process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID ? "WhatsApp Cloud API" : null,
});

const from = () => process.env.EMAIL_FROM || "Home Gardens <no-reply@localhost>";

export async function sendEmail(to: string, subject: string, text: string, html?: string): Promise<ChannelResult> {
  try {
    if (process.env.SMTP_HOST) {
      const t = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: Number(process.env.SMTP_PORT) === 465,
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
      });
      await t.sendMail({ from: from(), to, subject, text, html });
      return { status: "sent", provider: "smtp" };
    }
    if (process.env.RESEND_API_KEY) {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
        body: JSON.stringify({ from: from(), to: [to], subject, text, html }),
      });
      if (!r.ok) return { status: "failed", provider: "resend", error: `HTTP ${r.status}` };
      return { status: "sent", provider: "resend" };
    }
    if (process.env.NODE_ENV === "development") {
      console.info(`\n[email:dev] to=${to}\nsubject: ${subject}\n${text}\n`);
    }
    return { status: "skipped", error: "No email provider configured" };
  } catch (e) {
    return { status: "failed", provider: "email", error: (e as Error).message.slice(0, 300) };
  }
}

function e164(phone: string) {
  return phone.replace(/[^\d+]/g, "");
}

export async function sendSms(to: string, body: string): Promise<ChannelResult> {
  try {
    if (process.env.HUBTEL_SMS_CLIENT_ID) {
      const q = new URLSearchParams({
        clientid: process.env.HUBTEL_SMS_CLIENT_ID,
        clientsecret: process.env.HUBTEL_SMS_CLIENT_SECRET || "",
        from: process.env.HUBTEL_SMS_SENDER || "HomeGardens",
        to: e164(to).replace(/^\+/, ""),
        content: body,
      });
      const r = await fetch(`https://smsc.hubtel.com/v1/messages/send?${q}`);
      return r.ok ? { status: "sent", provider: "hubtel" } : { status: "failed", provider: "hubtel", error: `HTTP ${r.status}` };
    }
    if (process.env.TWILIO_ACCOUNT_SID) {
      const sid = process.env.TWILIO_ACCOUNT_SID;
      const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: "POST",
        headers: {
          Authorization: "Basic " + Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64"),
          "content-type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: e164(to), From: process.env.TWILIO_FROM_NUMBER || "", Body: body }),
      });
      return r.ok ? { status: "sent", provider: "twilio" } : { status: "failed", provider: "twilio", error: `HTTP ${r.status}` };
    }
    return { status: "skipped", error: "No SMS provider configured" };
  } catch (e) {
    return { status: "failed", provider: "sms", error: (e as Error).message.slice(0, 300) };
  }
}

export async function sendWhatsApp(to: string, body: string): Promise<ChannelResult> {
  const tokenV = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!tokenV || !phoneId) return { status: "skipped", error: "WhatsApp is not configured" };
  try {
    const r = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenV}`, "content-type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to: e164(to).replace(/^\+/, ""), type: "text", text: { body } }),
    });
    return r.ok ? { status: "sent", provider: "whatsapp" } : { status: "failed", provider: "whatsapp", error: `HTTP ${r.status}` };
  } catch (e) {
    return { status: "failed", provider: "whatsapp", error: (e as Error).message.slice(0, 300) };
  }
}
