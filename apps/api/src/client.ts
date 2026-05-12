/**
 * Re-export of the `hono/client` typed RPC client factory bound to AppType.
 * Import in apps/web like:
 *
 *   import { hc } from "@repo/api/client";
 *   const api = hc("http://localhost:3000");
 */
import { hc } from "hono/client";
import type { AppType } from "./app.js";

export type ApiClient = ReturnType<typeof hc<AppType>>;

export const createApiClient = (baseUrl: string, init?: RequestInit): ApiClient =>
  hc<AppType>(baseUrl, { init });
