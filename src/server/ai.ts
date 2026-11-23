import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { formatMoney } from "@/lib/money";

/**
 * Garden assistant. The API key stays on the server (ANTHROPIC_API_KEY); the browser never sees it.
 * Recommendations are grounded in the live service and product catalogue, passed in the system prompt.
 */
export const aiConfigured = () => !!process.env.ANTHROPIC_API_KEY;
const MODEL = () => process.env.AI_MODEL || "claude-opus-5-5";

let client: Anthropic | null = null;
function anthropic() {
  if (!client) client = new Anthropic();
  return client;
}

async function catalogue() {
  const [services, products] = await Promise.all([
    db.select({ slug: schema.services.slug, name: schema.services.name, summary: schema.services.summary, model: schema.services.pricingModel, price: schema.services.basePrice, currency: schema.services.currency, category: schema.serviceCategories.name })
      .from(schema.services).innerJoin(schema.serviceCategories, eq(schema.serviceCategories.id, schema.services.categoryId)).where(eq(schema.services.active, true)).orderBy(asc(schema.services.name)),
    db.select({ slug: schema.products.slug, name: schema.products.name, summary: schema.products.summary, price: schema.products.price, salePrice: schema.products.salePrice, currency: schema.products.currency, category: schema.productCategories.name })
      .from(schema.products).innerJoin(schema.productCategories, eq(schema.productCategories.id, schema.products.categoryId)).where(eq(schema.products.active, true)).orderBy(asc(schema.products.name)),
  ]);
  const s = services.map((x) => `- ${x.name} (${x.category}) — /services/${x.slug} — ${x.model === "quote" || x.model === "inspection" ? "priced by quote" : `${x.model} ${formatMoney(x.price, x.currency)}`} — ${x.summary}`).join("\n");
  const p = products.map((x) => `- ${x.name} (${x.category}) — /shop/${x.slug} — ${formatMoney(x.salePrice ?? x.price, x.currency)} — ${x.summary}`).join("\n");
  return `SERVICES WE OFFER\n${s}\n\nPRODUCTS IN OUR SHOP\n${p}`;
}

function systemPrompt(company: string) {
  return `You are the garden assistant for ${company}, a gardening services and garden-supplies company operating mainly in Ghana (Accra and Kumasi). You help customers understand garden problems, choose plants suited to their conditions, and decide which of our services or products would help.

How to answer:
- Be practical and specific to a West African tropical climate (two rainy seasons, harmattan dry season, high sun) unless the customer says they are elsewhere.
- Keep answers short and scannable: a direct answer first, then a few concrete steps. Plain language, no hype.
- When one of our services or products genuinely fits, recommend it by name and link to it with a markdown link using the exact path from the catalogue, e.g. [Tree & hedge pruning](/services/tree-and-hedge-pruning). Only recommend items that are in the catalogue below; never invent services, products, prices or availability. If nothing fits, say so and give general advice.
- If the customer wants to book, point them to the service link; booking happens on the website, not in this chat.
- For plant diseases, pests or damage, describe the most likely causes as possibilities, never as a confirmed diagnosis, and say what would confirm it (or suggest a consultation or pest & disease treatment visit). Photos can be misleading.
- Never give dosing beyond the product label for pesticides or fertilizers, and flag safety around children, pets, food crops and water sources.
- Don't discuss topics unrelated to gardening, plants, landscaping or our services; politely steer back.`;
}

export type ChatTurn = { role: "user" | "assistant"; text: string; image?: { data: string; mediaType: "image/jpeg" | "image/png" | "image/webp" } };

export async function askAssistant(turns: ChatTurn[], company: string) {
  const messages: Anthropic.Beta.BetaMessageParam[] = turns.map((t) =>
    t.role === "user" && t.image
      ? { role: "user", content: [{ type: "image", source: { type: "base64", media_type: t.image.mediaType, data: t.image.data } }, { type: "text", text: t.text || "What can you tell me about this garden photo?" }] }
      : { role: t.role, content: t.text },
  );
  const response = await anthropic().beta.messages.create({
    model: MODEL(),
    max_tokens: 4000,
    // Effort is set explicitly: chat-style answers don't need deep reasoning.
    output_config: { effort: "low" },
    // Stable content first so the catalogue prefix is cached across turns.
    system: [
      { type: "text", text: systemPrompt(company) },
      { type: "text", text: await catalogue(), cache_control: { type: "ephemeral" } },
    ],
    messages,
    // If a safety classifier declines, let the API retry on its default fallback model.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
  });
  if (response.stop_reason === "refusal") {
    return { text: "I can't help with that request. If it's about your garden, try rephrasing, or contact our team.", usage: response.usage };
  }
  const text = response.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
  return { text: text || "Sorry, I couldn't produce an answer. Please try again.", usage: response.usage };
}
