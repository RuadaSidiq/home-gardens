import { asc, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/server/auth/session";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { ActionButton } from "@/components/ui/form";
import { deleteAddress } from "../actions";
import { AddressModal } from "./address-form";

export const metadata = { title: "Addresses" };

export default async function Addresses() {
  const u = await requireUser();
  const [list, cities] = await Promise.all([
    db.select().from(schema.addresses).where(eq(schema.addresses.userId, u.id)).orderBy(desc(schema.addresses.isDefault)),
    db.select({ id: schema.cities.id, name: schema.cities.name, country: schema.cities.countryCode }).from(schema.cities).where(eq(schema.cities.active, true)).orderBy(asc(schema.cities.countryCode), asc(schema.cities.name)),
  ]);
  return (
    <>
      <PageHeader title="Addresses" description="Used for garden service visits and shop deliveries." actions={<AddressModal cities={cities} trigger="Add address" />} />
      {list.length === 0 ? <EmptyState title="No saved addresses" /> : (
        <div className="grid gap-4 md:grid-cols-2">
          {list.map((a) => (
            <Card key={a.id} className="p-5">
              <div className="flex items-start justify-between gap-2"><p className="font-semibold">{a.label}</p>{a.isDefault && <Badge tone="green">Default</Badge>}</div>
              <p className="mt-2 text-sm text-ink-soft">{a.recipient}<br />{a.line1}{a.line2 ? `, ${a.line2}` : ""}<br />{a.city}{a.region ? `, ${a.region}` : ""} · {a.countryCode}{a.digitalAddress ? <><br />{a.digitalAddress}</> : null}</p>
              <p className="mt-1 text-sm text-ink-muted">{a.phone}</p>
              <div className="mt-3 flex gap-1"><AddressModal address={a} cities={cities} trigger="Edit" /><ActionButton action={deleteAddress} fields={{ id: a.id }} variant="ghost" confirm="Delete this address?">Delete</ActionButton></div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
