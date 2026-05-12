import { Queue } from "bullmq";
import IORedis from "ioredis";

const redisUrl = process.env.REDIS_URL;
if (!redisUrl) throw new Error("REDIS_URL is required");

// BullMQ requires `maxRetriesPerRequest: null` on the producer connection.
export const redisConnection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
});

export const AGENT_QUEUE_NAME = "agent-runs";

export const agentQueue = new Queue(AGENT_QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5_000 },
    removeOnComplete: { age: 3600, count: 1000 },
    removeOnFail: { age: 7 * 24 * 3600 },
  },
});
