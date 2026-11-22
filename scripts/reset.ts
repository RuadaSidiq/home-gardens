import "dotenv/config";
import postgres from "postgres";

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to reset a production database");
  const client = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
  await client.unsafe("DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;");
  await client.end();
  console.log("Database reset");
}
main().catch((e) => { console.error(e); process.exit(1); });
