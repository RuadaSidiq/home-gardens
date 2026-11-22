import { readStored } from "@/server/storage";

const TYPES: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

/** Serves public uploads when using local storage. Only images under public/ are reachable. */
export async function GET(_: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const { key } = await params;
  const path = key.join("/");
  if (path.includes("..") || !/^[\w\-/.]+$/.test(path)) return new Response("Not found", { status: 404 });
  const ext = path.split(".").pop() ?? "";
  if (!TYPES[ext]) return new Response("Not found", { status: 404 });
  const buf = await readStored(`public/${path}`, "public");
  if (!buf) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(buf), { headers: { "content-type": TYPES[ext]!, "cache-control": "public, max-age=31536000, immutable", "x-content-type-options": "nosniff" } });
}
