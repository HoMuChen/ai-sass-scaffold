import type { Session } from "@repo/auth";
import type { MiddlewareHandler } from "hono";

export type AuthVariables = {
  userId: string;
  userEmail: string;
  organizationId: string;
  organizationRole: string;
};

export type SessionResolver = {
  api: {
    getSession: (input: { headers: Headers }) => Promise<Session>;
    getActiveMemberRole: (input: {
      headers: Headers;
      query?: {
        organizationId?: string;
      };
    }) => Promise<{ role: string } | null>;
  };
};

type SessionResolverFactory = () => Promise<SessionResolver>;

let defaultSessionResolverPromise: Promise<SessionResolver> | undefined;

async function loadDefaultSessionResolver(): Promise<SessionResolver> {
  defaultSessionResolverPromise ??= import("@repo/auth").then(
    ({ auth }) => auth as SessionResolver,
  );
  return defaultSessionResolverPromise;
}

function isSessionResolverFactory(
  input: SessionResolver | SessionResolverFactory,
): input is SessionResolverFactory {
  return typeof input === "function";
}

/** Resolves Better Auth session; rejects when there isn't one. */
export function createRequireOrganizationAuth(
  sessionResolver: SessionResolver | SessionResolverFactory = loadDefaultSessionResolver,
): MiddlewareHandler<{ Variables: AuthVariables }> {
  return async (c, next) => {
    const resolver = isSessionResolverFactory(sessionResolver)
      ? await sessionResolver()
      : sessionResolver;
    const headers = c.req.raw.headers;
    const session = await resolver.api.getSession({ headers });
    if (!session?.user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const organizationId =
      session.session.activeOrganizationId ??
      (session as Session & { activeOrganizationId?: string | null }).activeOrganizationId ??
      null;
    if (!organizationId) {
      return c.json({ error: "Active organization required" }, 403);
    }

    const memberRole = await resolver.api.getActiveMemberRole({
      headers,
      query: { organizationId },
    });
    if (!memberRole?.role) {
      return c.json({ error: "Organization membership required" }, 403);
    }

    c.set("userId", session.user.id);
    c.set("userEmail", session.user.email);
    c.set("organizationId", organizationId);
    c.set("organizationRole", memberRole.role);
    await next();
  };
}

export const createRequireAuth = createRequireOrganizationAuth;
export const requireAuth = createRequireOrganizationAuth();
