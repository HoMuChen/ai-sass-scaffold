import type { Session } from "@repo/auth";
import type { MiddlewareHandler } from "hono";
import type { SessionResolver } from "../middleware/auth.js";

type FakeSessionInput = Partial<{
  userId: string;
  email: string;
  activeOrganizationId: string | null;
}>;

export type FakeOrganizationContext = {
  activeOrganizationId: string | null;
  role: string | null;
};

export function fakeOrganizationContext(
  input: Partial<FakeOrganizationContext> = {},
): FakeOrganizationContext {
  return {
    activeOrganizationId: input.activeOrganizationId ?? "org_1",
    role: input.role ?? "member",
  };
}

export function fakeSession(input: FakeSessionInput = {}): NonNullable<Session> {
  const now = new Date();
  const activeOrganizationId =
    input.activeOrganizationId === undefined ? "org_1" : input.activeOrganizationId;

  return {
    user: {
      id: input.userId ?? "user_1",
      email: input.email ?? "user@example.com",
      emailVerified: false,
      name: "Test User",
      image: null,
      createdAt: now,
      updatedAt: now,
    },
    session: {
      id: "session_1",
      createdAt: now,
      updatedAt: now,
      userId: input.userId ?? "user_1",
      expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
      token: "token_1",
      activeOrganizationId,
      ipAddress: null,
      userAgent: "vitest",
    },
  };
}

export function fakeSessionResolver(
  session: Session = fakeSession(),
  organizationContext: FakeOrganizationContext = fakeOrganizationContext(),
): SessionResolver {
  return {
    api: {
      getSession: async () => session,
      getActiveMemberRole: async () =>
        organizationContext.role ? { role: organizationContext.role } : null,
    },
  };
}

export function fakeUnauthenticatedSessionResolver(): SessionResolver {
  return fakeSessionResolver(null);
}

type FakeRequireAuthInput = Partial<{
  userId: string;
  userEmail: string;
  organizationId: string;
  organizationRole: string;
}>;

export function fakeRequireAuth(
  input: FakeRequireAuthInput = {},
): MiddlewareHandler<{
  Variables: {
    userId: string;
    userEmail: string;
    organizationId: string;
    organizationRole: string;
  };
}> {
  return async (c, next) => {
    c.set("userId", input.userId ?? "user_1");
    c.set("userEmail", input.userEmail ?? "user@example.com");
    c.set("organizationId", input.organizationId ?? "org_1");
    c.set("organizationRole", input.organizationRole ?? "member");
    await next();
  };
}
