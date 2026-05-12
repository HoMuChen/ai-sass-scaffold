import { createApiClient } from "@repo/api/client";

const baseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

/**
 * Typed RPC client — every method is inferred from the Hono app definition
 * in @repo/api. Send credentials so Better Auth cookies flow.
 */
export const api = createApiClient(baseUrl, { credentials: "include" });
