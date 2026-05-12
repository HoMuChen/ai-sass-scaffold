import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL env var is required");
}

// `postgres` keeps a small pool — fine for both API and worker.
export const sql = postgres(databaseUrl, {
  max: Number(process.env.DATABASE_POOL_MAX ?? 10),
  prepare: false,
});

export const db = drizzle(sql, { schema });
export type Database = typeof db;
