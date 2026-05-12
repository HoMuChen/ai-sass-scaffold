import { db, schema } from "@repo/db";
import { agentJobPayloadSchema, startAgentRunSchema } from "@repo/schema";
import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { requireAuth, type AuthVariables } from "../middleware/auth.js";
import { agentQueue } from "../queue.js";

export const agentsRoute = new Hono<{ Variables: AuthVariables }>()
  .use("*", requireAuth)
  /**
   * POST /agents/runs — create an agent run record and enqueue the job.
   * The HTTP request returns immediately; the worker process picks the job up.
   */
  .post("/runs", zValidator("json", startAgentRunSchema), async (c) => {
    const userId = c.get("userId");
    const body = c.req.valid("json");

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

    const payload = agentJobPayloadSchema.parse({
      runId: run.id,
      userId,
      agent: body.agent,
      input: body.input,
      model: body.model,
    });
    const job = await agentQueue.add(body.agent, payload, { jobId: run.id });
    await db
      .update(schema.agentRuns)
      .set({ queueJobId: job.id })
      .where(eq(schema.agentRuns.id, run.id));

    return c.json({ id: run.id, status: run.status }, 201);
  })
  .get("/runs/:id", async (c) => {
    const userId = c.get("userId");
    const id = c.req.param("id");

    const run = await db.query.agentRuns.findFirst({
      where: (r, { and, eq }) => and(eq(r.id, id), eq(r.userId, userId)),
    });
    if (!run) return c.json({ error: "Not found" }, 404);
    return c.json(run);
  })
  .get("/runs", async (c) => {
    const userId = c.get("userId");
    const runs = await db.query.agentRuns.findMany({
      where: (r, { eq }) => eq(r.userId, userId),
      orderBy: (r, { desc }) => desc(r.createdAt),
      limit: 50,
    });
    return c.json({ runs });
  });
