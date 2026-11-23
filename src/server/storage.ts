import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { UserError } from "./errors";

const LOCAL_ROOT = path.join(process.cwd(), "uploads");

const KINDS = {
  image: { mimes: ["image/jpeg", "image/png", "image/webp"], maxBytes: 8 * 1024 * 1024 },
  document: { mimes: ["image/jpeg", "image/png", "image/webp", "application/pdf"], maxBytes: 10 * 1024 * 1024 },
} as const;

/** Detect the real file type from magic bytes rather than trusting the browser. */
export function sniffMime(buf: Buffer): string | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.length >= 12 && buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP") return "image/webp";
  if (buf.length >= 5 && buf.subarray(0, 5).toString() === "%PDF-") return "application/pdf";
  return null;
}

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };

function s3() {
  return new S3Client({
    endpoint: process.env.S3_ENDPOINT || undefined,
    region: process.env.S3_REGION || "auto",
    forcePathStyle: true,
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID!, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY! },
  });
}
const driver = () => (process.env.STORAGE_DRIVER === "s3" ? "s3" : process.env.STORAGE_DRIVER === "db" ? "db" : "local");

export type StoredFile = { id: string; url: string; key: string; mime: string };

/**
 * Validates and stores an uploaded file. Public files get a stable URL; private files
 * are only reachable through /api/files/[id] which checks authorization.
 */
export async function storeUpload(
  file: File,
  opts: { kind: keyof typeof KINDS; visibility: "public" | "private"; purpose: string; ownerId: string | null },
): Promise<StoredFile> {
  const rule = KINDS[opts.kind];
  if (!file || file.size === 0) throw new UserError("Please choose a file.");
  if (file.size > rule.maxBytes) throw new UserError(`Files must be smaller than ${Math.round(rule.maxBytes / 1024 / 1024)} MB.`);
  const buf = Buffer.from(await file.arrayBuffer());
  const mime = sniffMime(buf);
  if (!mime || !(rule.mimes as readonly string[]).includes(mime)) {
    throw new UserError(opts.kind === "image" ? "Upload a JPG, PNG or WebP image." : "Upload a PDF, JPG, PNG or WebP file.");
  }
  const key = `${opts.visibility}/${opts.purpose}/${new Date().toISOString().slice(0, 7)}/${randomUUID()}.${EXT[mime]}`;

  if (driver() === "s3") {
    const bucket = opts.visibility === "public" ? process.env.S3_BUCKET_PUBLIC! : process.env.S3_BUCKET_PRIVATE!;
    await s3().send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: buf, ContentType: mime }));
  } else if (driver() === "db") {
    await db.insert(schema.fileBlobs).values({ key, data: buf.toString("base64") });
  } else {
    const full = path.join(LOCAL_ROOT, key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, buf);
  }

  const [row] = await db
    .insert(schema.files)
    .values({ key, visibility: opts.visibility, mime, size: buf.length, purpose: opts.purpose, ownerId: opts.ownerId, originalName: file.name.slice(0, 200) })
    .returning({ id: schema.files.id });
  return { id: row!.id, key, mime, url: opts.visibility === "public" ? publicUrl(key) : `/api/files/${row!.id}` };
}

export function publicUrl(key: string) {
  if (driver() === "s3" && process.env.S3_PUBLIC_URL) return `${process.env.S3_PUBLIC_URL.replace(/\/$/, "")}/${key}`;
  return `/media/${key.replace(/^public\//, "")}`;
}

export async function readStored(key: string, visibility: "public" | "private"): Promise<Buffer | null> {
  if (key.includes("..")) return null;
  try {
    if (driver() === "s3") {
      const bucket = visibility === "public" ? process.env.S3_BUCKET_PUBLIC! : process.env.S3_BUCKET_PRIVATE!;
      const res = await s3().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      return Buffer.from(await res.Body!.transformToByteArray());
    }
    if (driver() === "db") {
      const [row] = await db.select().from(schema.fileBlobs).where(eq(schema.fileBlobs.key, key));
      return row ? Buffer.from(row.data, "base64") : null;
    }
    return await readFile(path.join(LOCAL_ROOT, key));
  } catch {
    return null;
  }
}

export async function storeImages(files: File[], purpose: string, ownerId: string | null, max = 6) {
  const valid = files.filter((f) => f && f.size > 0).slice(0, max);
  const out: string[] = [];
  for (const f of valid) out.push((await storeUpload(f, { kind: "image", visibility: "public", purpose, ownerId })).url);
  return out;
}
