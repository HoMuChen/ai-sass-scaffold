/**
 * Migration runner — MUST be executed in the PaaS release-phase / pre-deploy
 * job, NOT at API runtime. See blueprint §5 "Database Migration".
 *
 *   DATABASE_URL=... pnpm --filter @repo/db db:migrate
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

// Load .env from the monorepo root so this script works whether invoked
// from packages/db or via `pnpm --filter` at the repo root.
const here = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(here, "../../../.env") });

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to run migrations");
  }

  // Dedicated single-connection client; closed after the migration finishes.
  const migrationClient = postgres(databaseUrl, { max: 1 });
  const db = drizzle(migrationClient);

  console.log("[db] applying migrations from ./drizzle ...");
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("[db] migrations applied");

  await migrationClient.end();
}

main().catch((err) => {
  console.error("[db] migration failed", err);
  process.exit(1);
});
