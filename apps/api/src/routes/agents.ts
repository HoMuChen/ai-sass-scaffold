import { agentJobPayloadSchema, startAgentRunSchema } from "@repo/schema";
import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { Hono, type MiddlewareHandler } from "hono";
import { requireAuth, type AuthVariables } from "../middleware/auth.js";
import type { z } from "zod";

type StartAgentRunInput = z.infer<typeof startAgentRunSchema>;
type AgentJobPayload = z.infer<typeof agentJobPayloadSchema>;
type AgentRunSummary = {
  id: string;
  status: string;
};
type AgentRunRecord = {
  id: string;
  organizationId: string;
  triggeredByUserId: string;
  agent: string;
  status: string;
  model: string | null;
  input: unknown;
  result: unknown;
  error: string | null;
  queueJobId: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

let dbModulePromise: Promise<typeof import("@repo/db")> | undefined;

async function loadDbModule(): Promise<typeof import("@repo/db")> {
  dbModulePromise ??= import("@repo/db");
  return dbModulePromise;
}

export type AgentsRouteDeps = {
  requireAuth: MiddlewareHandler<{ Variables: AuthVariables }>;
  createRun: (input: {
    organizationId: string;
    userId: string;
    body: StartAgentRunInput;
  }) => Promise<AgentRunSummary>;
  enqueueRun: (input: {
    agent: string;
    payload: AgentJobPayload;
    runId: string;
  }) => Promise<{ id?: string | null | undefined }>;
  attachQueueJobId: (input: { runId: string; queueJobId?: string | null | undefined }) => Promise<void>;
  findRunById: (input: { id: string; organizationId: string }) => Promise<AgentRunRecord | undefined>;
  listRunsByOrganizationId: (input: { organizationId: string }) => Promise<AgentRunRecord[]>;
};

function getDefaultDeps(): AgentsRouteDeps {
  return {
    requireAuth,
    createRun: async ({ organizationId, userId, body }) => {
      const { db, schema } = await loadDbModule();
      const [run] = await db
        .insert(schema.agentRuns)
        .values({
          organizationId,
          triggeredByUserId: userId,
          agent: body.agent,
          model: body.model,
          input: body.input,
          status: "queued",
        })
        .returning();
      if (!run) throw new Error("failed to insert agent run");

      return { id: run.id, status: run.status };
    },
    enqueueRun: async ({ agent, payload, runId }) => {
      const { agentQueue } = await import("../queue.js");
      return agentQueue.add(agent, payload, { jobId: runId });
    },
    attachQueueJobId: async ({ runId, queueJobId }) => {
      const { db, schema } = await loadDbModule();
      await db
        .update(schema.agentRuns)
        .set({ queueJobId })
        .where(eq(schema.agentRuns.id, runId));
    },
    findRunById: async ({ id, organizationId }) => {
      const { db } = await loadDbModule();
      return db.query.agentRuns.findFirst({
        where: (r, { and, eq: whereEq }) =>
          and(whereEq(r.id, id), whereEq(r.organizationId, organizationId)),
      });
    },
    listRunsByOrganizationId: async ({ organizationId }) => {
      const { db } = await loadDbModule();
      return db.query.agentRuns.findMany({
        where: (r, { eq: whereEq }) => whereEq(r.organizationId, organizationId),
        orderBy: (r, { desc }) => desc(r.createdAt),
        limit: 50,
      });
    },
  };
}

function resolveDeps(overrides: Partial<AgentsRouteDeps> = {}): AgentsRouteDeps {
  return {
    ...getDefaultDeps(),
    ...overrides,
  };
}

export function createAgentsRoute(overrides: Partial<AgentsRouteDeps> = {}) {
  const deps = resolveDeps(overrides);

  return new Hono<{ Variables: AuthVariables }>()
    .use("*", deps.requireAuth)
    /**
     * POST /agents/runs — create an agent run record and enqueue the job.
     * The HTTP request returns immediately; the worker process picks the job up.
     */
    .post("/runs", zValidator("json", startAgentRunSchema), async (c) => {
      const userId = c.get("userId");
      const organizationId = c.get("organizationId");
      const body = c.req.valid("json");

      const run = await deps.createRun({ organizationId, userId, body });

      const payload = agentJobPayloadSchema.parse({
        runId: run.id,
        organizationId,
        userId,
        agent: body.agent,
        input: body.input,
        model: body.model,
      });
      const job = await deps.enqueueRun({
        agent: body.agent,
        payload,
        runId: run.id,
      });
      await deps.attachQueueJobId({ runId: run.id, queueJobId: job.id });

      return c.json({ id: run.id, status: run.status }, 201);
    })
    .get("/runs/:id", async (c) => {
      const organizationId = c.get("organizationId");
      const id = c.req.param("id");

      const run = await deps.findRunById({ id, organizationId });
      if (!run) return c.json({ error: "Not found" }, 404);
      return c.json(run);
    })
    .get("/runs", async (c) => {
      const organizationId = c.get("organizationId");
      const runs = await deps.listRunsByOrganizationId({ organizationId });
      return c.json({ runs });
    });
}

export const agentsRoute = createAgentsRoute();
