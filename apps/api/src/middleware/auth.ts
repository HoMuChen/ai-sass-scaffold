import { auth } from "@repo/auth";
import type { MiddlewareHandler } from "hono";

export type AuthVariables = {
  userId: string;
  userEmail: string;
};

/** Resolves Better Auth session; rejects when there isn't one. */
export const requireAuth: MiddlewareHandler<{ Variables: AuthVariables }> = async (
  c,
  next,
) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  c.set("userId", session.user.id);
  c.set("userEmail", session.user.email);
  await next();
};
