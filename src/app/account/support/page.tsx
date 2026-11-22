import { SupportHome } from "@/components/portal/support";
export const metadata = { title: "Support" };
export default async function Support({ searchParams }: { searchParams: Promise<{ booking?: string }> }) {
  return <SupportHome base="/account/support" bookingId={(await searchParams).booking} />;
}
