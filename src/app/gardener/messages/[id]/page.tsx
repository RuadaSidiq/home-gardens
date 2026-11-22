import { ConversationView } from "@/components/portal/conversations";
export const metadata = { title: "Conversation" };
export default async function C({ params }: { params: Promise<{ id: string }> }) { return <ConversationView id={(await params).id} base="/gardener/messages" backLabel="Messages" />; }
