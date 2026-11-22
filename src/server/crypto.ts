import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function key() {
  const k = process.env.DATA_ENCRYPTION_KEY;
  if (!k) throw new Error("DATA_ENCRYPTION_KEY is not configured");
  const buf = Buffer.from(k, "base64");
  if (buf.length !== 32) throw new Error("DATA_ENCRYPTION_KEY must be 32 bytes (base64)");
  return buf;
}

/** AES-256-GCM encryption for sensitive fields such as payout account details. */
export function encrypt(plain: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), enc.toString("base64")].join(":");
}

export function decrypt(payload: string) {
  const [v, iv, tag, data] = payload.split(":");
  if (v !== "v1" || !iv || !tag || !data) throw new Error("Unsupported ciphertext");
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(data, "base64")), d.final()]).toString("utf8");
}

export function mask(value: string, visible = 4) {
  const v = value.replace(/\s/g, "");
  return v.length <= visible ? v : "•••• " + v.slice(-visible);
}
