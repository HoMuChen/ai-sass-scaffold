import type { AgentJobPayload } from "@repo/schema";
import { runEchoAgent } from "./echo.js";

export type AgentHandler = (payload: AgentJobPayload) => Promise<unknown>;

/**
 * Register additional agents here. Add a key per agent name; the dispatcher
 * picks the handler based on `payload.agent`.
 */
export const agentRegistry: Record<string, AgentHandler> = {
  echo: runEchoAgent,
};
