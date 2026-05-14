import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { fakeRequireAuth } from "../test-utils/fakes.js";
import { createAgentsRoute } from "./agents.js";

describe("agents routes", () => {
  it("lists runs for the active organization, including runs created by other users", async () => {
    const listRunsByOrganizationId = vi.fn(async ({ organizationId }: { organizationId: string }) => [
      {
        id: `${organizationId}_run_a`,
        organizationId,
        triggeredByUserId: "user_1",
        agent: "echo",
        status: "queued",
        model: null,
        input: { message: "a" },
        result: null,
        error: null,
        queueJobId: null,
        startedAt: null,
        finishedAt: null,
        createdAt: new Date("2026-05-14T00:00:00.000Z"),
        updatedAt: new Date("2026-05-14T00:00:00.000Z"),
      },
      {
        id: `${organizationId}_run_b`,
        organizationId,
        triggeredByUserId: "user_2",
        agent: "echo",
        status: "queued",
        model: null,
        input: { message: "b" },
        result: null,
        error: null,
        queueJobId: null,
        startedAt: null,
        finishedAt: null,
        createdAt: new Date("2026-05-14T00:00:00.000Z"),
        updatedAt: new Date("2026-05-14T00:00:00.000Z"),
      },
    ]);
    const app = new Hono().route(
      "/agents",
      createAgentsRoute({
        requireAuth: fakeRequireAuth({ userId: "user_1", organizationId: "org_1" }),
        listRunsByOrganizationId,
      }),
    );

    const res = await app.request("http://test/agents/runs");

    expect(res.status).toBe(200);
    expect(listRunsByOrganizationId).toHaveBeenCalledWith({ organizationId: "org_1" });
    expect(await res.json()).toEqual({
      runs: [
        expect.objectContaining({ id: "org_1_run_a", organizationId: "org_1" }),
        expect.objectContaining({ id: "org_1_run_b", organizationId: "org_1" }),
      ],
    });
  });

  it("returns 404 for a run outside the active organization", async () => {
    const findRunById = vi.fn(async () => undefined);
    const app = new Hono().route(
      "/agents",
      createAgentsRoute({
        requireAuth: fakeRequireAuth({ userId: "user_1", organizationId: "org_1" }),
        findRunById,
      }),
    );

    const res = await app.request("http://test/agents/runs/run_other_org");

    expect(res.status).toBe(404);
    expect(findRunById).toHaveBeenCalledWith({
      id: "run_other_org",
      organizationId: "org_1",
    });
    expect(await res.json()).toEqual({ error: "Not found" });
  });

  it("creates runs and enqueues payloads with organization scope", async () => {
    const createRun = vi.fn(async () => ({ id: "run_1", status: "queued" }));
    const enqueueRun = vi.fn(async () => ({ id: "job_1" }));
    const attachQueueJobId = vi.fn(async () => undefined);
    const app = new Hono().route(
      "/agents",
      createAgentsRoute({
        requireAuth: fakeRequireAuth({
          userId: "user_7",
          userEmail: "member@example.com",
          organizationId: "org_9",
          organizationRole: "member",
        }),
        createRun,
        enqueueRun,
        attachQueueJobId,
      }),
    );

    const res = await app.request("http://test/agents/runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        agent: "echo",
        input: { prompt: "hello" },
        model: "openai/gpt-4o-mini",
      }),
    });

    expect(res.status).toBe(201);
    expect(createRun).toHaveBeenCalledWith({
      organizationId: "org_9",
      userId: "user_7",
      body: {
        agent: "echo",
        input: { prompt: "hello" },
        model: "openai/gpt-4o-mini",
      },
    });
    expect(enqueueRun).toHaveBeenCalledWith({
      agent: "echo",
      runId: "run_1",
      payload: {
        runId: "run_1",
        organizationId: "org_9",
        userId: "user_7",
        agent: "echo",
        input: { prompt: "hello" },
        model: "openai/gpt-4o-mini",
      },
    });
    expect(attachQueueJobId).toHaveBeenCalledWith({ runId: "run_1", queueJobId: "job_1" });
  });
});
