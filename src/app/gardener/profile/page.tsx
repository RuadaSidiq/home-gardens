import Image from "next/image";
import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireGardener } from "@/server/auth/session";
import { Card, CardHeader, PageHeader, StatusBadge } from "@/components/ui/primitives";
import { ActionButton } from "@/components/ui/form";
import { toMajor } from "@/lib/money";
import { titleCase } from "@/lib/utils";
import { deletePortfolio } from "../actions";
import { PortfolioUpload, ProfileForm } from "./forms";

export const metadata = { title: "Profile & portfolio" };

export default async function GardenerProfilePage() {
  const u = await requireGardener();
  const [[g], portfolio, docs] = await Promise.all([
    db.select().from(schema.gardenerProfiles).where(eq(schema.gardenerProfiles.id, u.gardenerId)),
    db.select().from(schema.gardenerPortfolio).where(eq(schema.gardenerPortfolio.gardenerId, u.gardenerId)).orderBy(asc(schema.gardenerPortfolio.sort)),
    db.select().from(schema.gardenerDocuments).where(eq(schema.gardenerDocuments.gardenerId, u.gardenerId)),
  ]);
  return (
    <>
      <PageHeader title="Profile & portfolio" actions={g!.status === "approved" && <Link href={`/gardeners/${g!.slug}`} className="text-sm link">View public profile</Link>} />
      <div className="space-y-6">
        <Card><CardHeader title="Public profile" /><div className="p-5"><ProfileForm independent={u.gardenerType === "independent"} g={{ ...g!, hourlyRate: g!.hourlyRate ? String(toMajor(g!.hourlyRate, g!.currency)) : "" }} /></div></Card>
        <Card>
          <CardHeader title="Portfolio" description="Photos of your best work help customers choose you." />
          <div className="space-y-4 p-5">
            <PortfolioUpload />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {portfolio.map((p) => (
                <figure key={p.id}>
                  <div className="relative aspect-[4/3] overflow-hidden rounded-md bg-sand-100"><Image src={p.imageUrl} alt={p.caption ?? ""} fill sizes="25vw" className="object-cover" /></div>
                  <figcaption className="mt-1 flex items-center justify-between gap-2 text-xs text-ink-muted"><span className="truncate">{p.caption}</span><ActionButton action={deletePortfolio} fields={{ id: p.id }} variant="ghost" confirm="Remove this photo?">Remove</ActionButton></figcaption>
                </figure>
              ))}
            </div>
          </div>
        </Card>
        <Card>
          <CardHeader title="Verification documents" description="Visible only to you and our verification team." />
          <ul className="divide-y divide-sand-100">{docs.map((d) => <li key={d.id} className="flex items-center justify-between px-5 py-3 text-sm"><a href={`/api/files/${d.fileId}`} target="_blank" rel="noopener noreferrer" className="link">{titleCase(d.type)}</a><StatusBadge status={d.status} /></li>)}</ul>
          {docs.length === 0 && <p className="px-5 py-4 text-sm text-ink-muted">No documents on file.</p>}
        </Card>
      </div>
    </>
  );
}
