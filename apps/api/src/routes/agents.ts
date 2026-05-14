import { db, schema } from "@repo/db";
import { agentJobPayloadSchema, startAgentRunSchema } from "@repo/schema";
import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { Hono, type MiddlewareHandler } from "hono";
import { requireAuth, type AuthVariables } from "../middleware/auth.js";
import { agentQueue as defaultAgentQueue } from "../queue.js";
import type { z } from "zod";

type StartAgentRunInput = z.infer<typeof startAgentRunSchema>;
type AgentJobPayload = z.infer<typeof agentJobPayloadSchema>;
type AgentRunSummary = {
  id: string;
  status: string;
};
type AgentRunRecord = Awaited<ReturnType<typeof db.query.agentRuns.findFirst>>;

export type AgentsRouteDeps = {
  requireAuth: MiddlewareHandler<{ Variables: AuthVariables }>;
  createRun: (input: {
    userId: string;
    body: StartAgentRunInput;
  }) => Promise<AgentRunSummary>;
  enqueueRun: (input: {
    agent: string;
    payload: AgentJobPayload;
    runId: string;
  }) => Promise<{ id?: string | null | undefined }>;
  attachQueueJobId: (input: { runId: string; queueJobId?: string | null | undefined }) => Promise<void>;
  findRunById: (input: { id: string; userId: string }) => Promise<AgentRunRecord>;
  listRunsByUserId: (input: { userId: string }) => Promise<AgentRunRecord[]>;
};

function getDefaultDeps(): AgentsRouteDeps {
  return {
    requireAuth,
    createRun: async ({ userId, body }) => {
      const [run] = await db
        .insert(schema.agentRuns)
        .values({
          userId,
          agent: body.agent,
          model: body.model,
          input: body.input,
          status: "queued",
        })
        .returning();
      if (!run) throw new Error("failed to insert agent run");

      return { id: run.id, status: run.status };
    },
    enqueueRun: async ({ agent, payload, runId }) =>
      defaultAgentQueue.add(agent, payload, { jobId: runId }),
    attachQueueJobId: async ({ runId, queueJobId }) => {
      await db
        .update(schema.agentRuns)
        .set({ queueJobId })
        .where(eq(schema.agentRuns.id, runId));
    },
    findRunById: ({ id, userId }) =>
      db.query.agentRuns.findFirst({
        where: (r, { and, eq: whereEq }) => and(whereEq(r.id, id), whereEq(r.userId, userId)),
      }),
    listRunsByUserId: ({ userId }) =>
      db.query.agentRuns.findMany({
        where: (r, { eq: whereEq }) => whereEq(r.userId, userId),
        orderBy: (r, { desc }) => desc(r.createdAt),
        limit: 50,
      }),
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
      const body = c.req.valid("json");

      const run = await deps.createRun({ userId, body });

      const payload = agentJobPayloadSchema.parse({
        runId: run.id,
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
      const userId = c.get("userId");
      const id = c.req.param("id");

      const run = await deps.findRunById({ id, userId });
      if (!run) return c.json({ error: "Not found" }, 404);
      return c.json(run);
    })
    .get("/runs", async (c) => {
      const userId = c.get("userId");
      const runs = await deps.listRunsByUserId({ userId });
      return c.json({ runs });
    });
}

export const agentsRoute = createAgentsRoute();
