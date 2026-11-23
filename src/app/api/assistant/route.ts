import { NextResponse } from "next/server";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { db, schema } from "@/db";
import { getCurrentUser } from "@/server/auth/session";
import { rateLimit } from "@/server/rate-limit";
import { aiConfigured, askAssistant } from "@/server/ai";
import { getSettings } from "@/server/settings";
import { sniffMime } from "@/server/storage";
import { reportError } from "@/server/errors";

const body = z.object({
  turns: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    text: z.string().max(4000),
    image: z.object({ data: z.string().max(7_000_000), mediaType: z.enum(["image/jpeg", "image/png", "image/webp"]) }).optional(),
  })).min(1).max(20),
});

export async function POST(req: Request) {
  if (!aiConfigured()) return NextResponse.json({ error: "The garden assistant isn't configured on this site yet." }, { status: 503 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Please sign in to use the garden assistant." }, { status: 401 });
  if (!(await rateLimit(`ai:${user.id}`, 30, 3600))) return NextResponse.json({ error: "You've reached the hourly limit for the assistant. Please try again later." }, { status: 429 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const turns = parsed.data.turns.slice(-12);
  if (turns[turns.length - 1]!.role !== "user") return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  // Only the latest image is sent, after checking it really is an image of the declared type.
  for (let i = 0; i < turns.length; i++) {
    const img = turns[i]!.image;
    if (!img) continue;
    if (i !== turns.length - 1) { delete turns[i]!.image; continue; }
    const buf = Buffer.from(img.data, "base64");
    if (buf.length > 5 * 1024 * 1024 || sniffMime(buf) !== img.mediaType) return NextResponse.json({ error: "Please upload a JPG, PNG or WebP photo under 5 MB." }, { status: 400 });
  }
  try {
    const { company } = await getSettings();
    const r = await askAssistant(turns, company.name);
    await db.insert(schema.aiUsage).values({ userId: user.id, kind: turns.at(-1)!.image ? "chat_image" : "chat", inputTokens: r.usage.input_tokens, outputTokens: r.usage.output_tokens });
    return NextResponse.json({ text: r.text });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return NextResponse.json({ error: "The assistant is busy right now. Please try again in a minute." }, { status: 503 });
    await reportError(e, { where: "assistant" });
    return NextResponse.json({ error: "The assistant couldn't answer right now. Please try again." }, { status: 502 });
  }
}
