import { ButtonLink } from "@/components/ui/button";
export default function Forbidden() {
  return (
    <div className="mx-auto max-w-md py-20 text-center">
      <h1 className="text-2xl font-bold">You don't have access to this page</h1>
      <p className="mt-2 text-ink-muted">Ask an administrator to grant your role the required permission.</p>
      <ButtonLink href="/admin" className="mt-6">Back to dashboard</ButtonLink>
    </div>
  );
}
