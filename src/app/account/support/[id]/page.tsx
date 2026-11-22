import { TicketView } from "@/components/portal/support";
export const metadata = { title: "Support request" };
export default async function Ticket({ params }: { params: Promise<{ id: string }> }) {
  return <TicketView id={(await params).id} base="/account/support" />;
}
