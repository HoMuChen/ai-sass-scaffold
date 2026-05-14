import type { Session } from "@repo/auth";
import type { SessionResolver } from "../middleware/auth.js";

type FakeSessionInput = Partial<{
  userId: string;
  email: string;
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
      ipAddress: null,
      userAgent: "vitest",
    },
  };
}

export function fakeSessionResolver(session: Session = fakeSession()): SessionResolver {
  return {
    api: {
      getSession: async () => session,
    },
  };
}

export function fakeUnauthenticatedSessionResolver(): SessionResolver {
  return fakeSessionResolver(null);
}
