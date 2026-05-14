import { auth as defaultAuth, type Session } from "@repo/auth";
import type { MiddlewareHandler } from "hono";

export type AuthVariables = {
  userId: string;
  userEmail: string;
};

export type SessionResolver = {
  api: {
    getSession: (input: { headers: Headers }) => Promise<Session>;
  };
};

/** Resolves Better Auth session; rejects when there isn't one. */
export function createRequireAuth(
  sessionResolver: SessionResolver = defaultAuth,
): MiddlewareHandler<{ Variables: AuthVariables }> {
  return async (c, next) => {
    const session = await sessionResolver.api.getSession({ headers: c.req.raw.headers });
    if (!session?.user) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    c.set("userId", session.user.id);
    c.set("userEmail", session.user.email);
    await next();
  };
}

export const requireAuth = createRequireAuth();
