import { db, schema } from "@repo/db";
import { agentJobPayloadSchema } from "@repo/schema";
import { Worker } from "bullmq";
import { eq } from "drizzle-orm";
import IORedis from "ioredis";
import { agentRegistry } from "./agents/index.js";

const redisUrl = process.env.REDIS_URL;
if (!redisUrl) throw new Error("REDIS_URL is required");

const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
const concurrency = Number(process.env.WORKER_CONCURRENCY ?? 4);

const worker = new Worker(
  "agent-runs",
  async (job) => {
    const payload = agentJobPayloadSchema.parse(job.data);
    const handler = agentRegistry[payload.agent];
    if (!handler) throw new Error(`unknown agent: ${payload.agent}`);

    await db
      .update(schema.agentRuns)
      .set({ status: "running", startedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.agentRuns.id, payload.runId));

    try {
      const result = await handler(payload);
      await db
        .update(schema.agentRuns)
        .set({
          status: "succeeded",
          result: result as Record<string, unknown>,
          finishedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(schema.agentRuns.id, payload.runId));
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await db
        .update(schema.agentRuns)
        .set({
          status: "failed",
          error: message,
          finishedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(schema.agentRuns.id, payload.runId));
      throw err;
    }
  },
  { connection, concurrency },
);

worker.on("ready", () => {
  console.log(`[worker] ready · concurrency=${concurrency}`);
});
worker.on("failed", (job, err) => {
  console.error(`[worker] job ${job?.id} failed:`, err.message);
});
worker.on("completed", (job) => {
  console.log(`[worker] job ${job.id} completed`);
});

async function shutdown(signal: string) {
  console.log(`[worker] received ${signal}, draining...`);
  await worker.close();
  await connection.quit();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
