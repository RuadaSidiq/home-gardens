import { execSync } from "node:child_process";

export default function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgres://gardens:gardens@localhost:5432/gardens_test";
  const env = { ...process.env, DATABASE_URL: url, NODE_ENV: "development" as const };
  execSync("npx tsx scripts/reset.ts && npx tsx scripts/migrate.ts && npx tsx scripts/seed.ts", { env, stdio: "ignore" });
}
