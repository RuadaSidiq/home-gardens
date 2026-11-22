import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/server/auth/session";
import { getDisplayCurrency } from "@/server/site";
import { getRate } from "@/server/currency";
import { convert } from "@/lib/money";
import { EmptyState, PageHeader } from "@/components/ui/primitives";
import { ActionButton } from "@/components/ui/form";
import { GardenerCard, ProductCard } from "@/components/site/cards";
import { removeSavedGardener, removeWishlist } from "../actions";

export const metadata = { title: "Saved" };

export default async function Saved() {
  const u = await requireUser();
  const currency = await getDisplayCurrency();
  const rate = await getRate("GHS", currency);
  const [products, gardeners] = await Promise.all([
    db.select({ p: schema.products }).from(schema.wishlistItems).innerJoin(schema.products, eq(schema.products.id, schema.wishlistItems.productId)).where(eq(schema.wishlistItems.userId, u.id)),
    db.select({ g: schema.gardenerProfiles, name: schema.users.fullName, avatar: schema.users.avatarUrl, city: schema.cities.name }).from(schema.savedGardeners)
      .innerJoin(schema.gardenerProfiles, eq(schema.gardenerProfiles.id, schema.savedGardeners.gardenerId))
      .innerJoin(schema.users, eq(schema.users.id, schema.gardenerProfiles.userId))
      .leftJoin(schema.cities, eq(schema.cities.id, schema.gardenerProfiles.baseCityId))
      .where(eq(schema.savedGardeners.userId, u.id)),
  ]);
  return (
    <>
      <PageHeader title="Saved" />
      <h2 className="mb-3 text-lg font-semibold">Wishlist</h2>
      {products.length === 0 ? <EmptyState title="Your wishlist is empty" description="Tap 'Add to wishlist' on any product." /> : (
        <div className="grid grid-cols-2 gap-x-4 gap-y-6 md:grid-cols-3 xl:grid-cols-4">
          {products.map(({ p }) => (
            <div key={p.id}>
              <ProductCard product={p} price={convert(p.price, rate)} salePrice={p.salePrice != null ? convert(p.salePrice, rate) : null} currency={currency} />
              <div className="mt-1"><ActionButton action={removeWishlist} fields={{ productId: p.id }} variant="ghost">Remove</ActionButton></div>
            </div>
          ))}
        </div>
      )}
      <h2 className="mb-3 mt-10 text-lg font-semibold">Saved gardeners</h2>
      {gardeners.length === 0 ? <EmptyState title="No saved gardeners" description="Save gardeners from their profile to book them again quickly." /> : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {gardeners.map((g) => <div key={g.g.id}><GardenerCard gardener={g} compact /><div className="mt-1"><ActionButton action={removeSavedGardener} fields={{ gardenerId: g.g.id }} variant="ghost">Remove</ActionButton></div></div>)}
        </div>
      )}
    </>
  );
}
