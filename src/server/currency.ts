import { and, desc, eq } from "drizzle-orm";
import { db, schema, type DbOrTx } from "@/db";
import { convert } from "@/lib/money";

/** Latest exchange rate quote-per-base. Uses direct pair, inverse pair, or a cross via USD. */
export async function getRate(base: string, quote: string, tx: DbOrTx = db): Promise<number> {
  if (base === quote) return 1;
  const direct = await latest(base, quote, tx);
  if (direct) return direct;
  const inverse = await latest(quote, base, tx);
  if (inverse) return 1 / inverse;
  for (const via of ["USD", "GHS"]) {
    if (via === base || via === quote) continue;
    const a = await latestEither(base, via, tx);
    const b = await latestEither(via, quote, tx);
    if (a && b) return a * b;
  }
  throw new Error(`No exchange rate configured for ${base}/${quote}`);
}

async function latest(base: string, quote: string, tx: DbOrTx) {
  const [r] = await tx
    .select({ rate: schema.exchangeRates.rate })
    .from(schema.exchangeRates)
    .where(and(eq(schema.exchangeRates.base, base), eq(schema.exchangeRates.quote, quote)))
    .orderBy(desc(schema.exchangeRates.effectiveAt))
    .limit(1);
  return r ? Number(r.rate) : null;
}
async function latestEither(base: string, quote: string, tx: DbOrTx) {
  const d = await latest(base, quote, tx);
  if (d) return d;
  const i = await latest(quote, base, tx);
  return i ? 1 / i : null;
}

export async function convertAmount(minor: number, from: string, to: string, tx: DbOrTx = db) {
  if (from === to) return minor;
  return convert(minor, await getRate(from, to, tx));
}

export async function activeCurrencies() {
  return db.select().from(schema.currencies).where(eq(schema.currencies.active, true));
}
