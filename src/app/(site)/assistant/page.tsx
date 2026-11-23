import { getCurrentUser } from "@/server/auth/session";
import { aiConfigured } from "@/server/ai";
import { AssistantChat } from "./chat";

export const metadata = { title: "Garden assistant", description: "Get practical, AI-generated gardening advice and find the right service or product." };

export default async function AssistantPage() {
  const user = await getCurrentUser();
  return (
    <div className="container max-w-3xl py-10 sm:py-14">
      <p className="eyebrow">Garden assistant</p>
      <h1 className="h-page mt-2">Ask about your garden</h1>
      <p className="lead mt-3">Describe a problem or upload a photo for practical advice suited to Ghana's climate, with links to the services and products that can help.</p>
      <p className="mt-3 text-sm text-ink-muted">Answers are AI-generated and can be wrong. Plant disease suggestions are possibilities, not a diagnosis – for anything serious, book a garden consultation.</p>
      <div className="mt-8"><AssistantChat configured={aiConfigured()} signedIn={!!user} /></div>
    </div>
  );
}
