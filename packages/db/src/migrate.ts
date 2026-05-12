/**
 * Migration runner — MUST be executed in the PaaS release-phase / pre-deploy
 * job, NOT at API runtime. See blueprint §5 "Database Migration".
 *
 *   DATABASE_URL=... pnpm --filter @repo/db db:migrate
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

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
