import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSession, getActiveMemberRole, authHandler } = vi.hoisted(() => ({
  getSession: vi.fn(),
  getActiveMemberRole: vi.fn(),
  authHandler: vi.fn(() => new Response("ok", { status: 200 })),
}));

vi.mock("@repo/auth", () => ({
  auth: {
    handler: authHandler,
    api: {
      getSession,
      getActiveMemberRole,
    },
  },
}));

import { app } from "./app.js";

describe("app wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSession.mockResolvedValue({
      user: {
        id: "user_1",
        email: "user@example.com",
      },
      session: {
        activeOrganizationId: null,
      },
    });
    getActiveMemberRole.mockResolvedValue({ role: "member" });
  });

  it("returns 403 when there is no active organization", async () => {
    const res = await app.request("http://test/agents/runs");

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Active organization required" });
  });
});
