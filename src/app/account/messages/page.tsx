import { PageHeader } from "@/components/ui/primitives";
import { ConversationList } from "@/components/portal/conversations";

export const metadata = { title: "Messages" };
export default function Messages() {
  return (<><PageHeader title="Messages" /><ConversationList base="/account/messages" /></>);
}
