import { auth } from "@repo/auth";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { agentsRoute } from "./routes/agents.js";
import { uploadsRoute } from "./routes/uploads.js";

/**
 * Hono app — single source of truth for the public API surface.
 * The exported `AppType` is consumed by `hono/client` for E2E type safety
 * (blueprint §1 - "100% 端到端型別安全").
 */
const app = new Hono()
  .use("*", logger())
  .use(
    "*",
    cors({
      origin: (process.env.API_CORS_ORIGIN ?? "http://localhost:5173")
        .split(",")
        .map((s) => s.trim()),
      credentials: true,
      allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization"],
    }),
  )
  .get("/health", (c) => c.json({ ok: true, ts: Date.now() }))
  // Better Auth mounts its own routes under /api/auth/* and handles its own CORS.
  .on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

const routes = app
  .route("/uploads", uploadsRoute)
  .route("/agents", agentsRoute);

export type AppType = typeof routes;
export { app };
