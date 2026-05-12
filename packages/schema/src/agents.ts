import { z } from "zod";

export const agentRunStatusSchema = z.enum([
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
]);
export type AgentRunStatus = z.infer<typeof agentRunStatusSchema>;

export const startAgentRunSchema = z.object({
  agent: z.string().min(1).max(64),
  input: z.record(z.unknown()),
  model: z.string().optional(),
});
export type StartAgentRunInput = z.infer<typeof startAgentRunSchema>;

export const agentRunSchema = z.object({
  id: z.string(),
  agent: z.string(),
  status: agentRunStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  result: z.unknown().nullable(),
  error: z.string().nullable(),
});
export type AgentRun = z.infer<typeof agentRunSchema>;

/** Queue job payload that the API enqueues and the worker consumes. */
export const agentJobPayloadSchema = z.object({
  runId: z.string(),
  userId: z.string(),
  agent: z.string(),
  input: z.record(z.unknown()),
  model: z.string().optional(),
});
export type AgentJobPayload = z.infer<typeof agentJobPayloadSchema>;
