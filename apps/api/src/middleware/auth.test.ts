import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import {
  fakeOrganizationContext,
  fakeSession,
  fakeSessionResolver,
  fakeUnauthenticatedSessionResolver,
} from "../test-utils/fakes.js";
import type { AuthVariables } from "./auth.js";
import { createRequireOrganizationAuth } from "./auth.js";

describe("createRequireOrganizationAuth", () => {
  it("returns 401 when there is no session user", async () => {
    const app = new Hono<{ Variables: AuthVariables }>();

    app.use("*", createRequireOrganizationAuth(fakeUnauthenticatedSessionResolver()));
    app.get("/", (c) => c.json({ ok: true }));

    const res = await app.request("http://test/");

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 403 when the session has no active organization", async () => {
    const app = new Hono<{ Variables: AuthVariables }>();
    const resolver = fakeSessionResolver(
      fakeSession({ activeOrganizationId: null }),
      fakeOrganizationContext({ activeOrganizationId: null }),
    );

    app.use("*", createRequireOrganizationAuth(resolver));
    app.get("/", (c) => c.json({ ok: true }));

    const res = await app.request("http://test/");

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Active organization required" });
  });

  it("resolves the active organization role into request context", async () => {
    const app = new Hono<{ Variables: AuthVariables }>();
    const getSession = vi.fn(async () =>
      fakeSession({ userId: "user_7", email: "owner@example.com", activeOrganizationId: "org_9" }),
    );
    const getActiveMemberRole = vi.fn(async () => ({ role: "owner" }));
    const resolver = {
      api: {
        getSession,
        getActiveMemberRole,
      },
    };

    app.use("*", createRequireOrganizationAuth(resolver));
    app.get("/", (c) =>
      c.json({
        userId: c.get("userId"),
        userEmail: c.get("userEmail"),
        organizationId: c.get("organizationId"),
        organizationRole: c.get("organizationRole"),
      }),
    );

    const res = await app.request("http://test/");

    expect(res.status).toBe(200);
    expect(getSession).toHaveBeenCalledWith({ headers: expect.any(Headers) });
    expect(getActiveMemberRole).toHaveBeenCalledTimes(1);
    expect(getActiveMemberRole).toHaveBeenCalledWith({
      headers: expect.any(Headers),
      query: { organizationId: "org_9" },
    });
    expect(await res.json()).toEqual({
      userId: "user_7",
      userEmail: "owner@example.com",
      organizationId: "org_9",
      organizationRole: "owner",
    });
  });
});
