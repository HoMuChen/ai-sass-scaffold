import { chat } from "@repo/ai";
import type { AgentJobPayload } from "@repo/schema";

/**
 * Placeholder single-agent runner. Swap in LangGraph state machine here
 * when wiring real multi-agent flows (blueprint §2 - apps/worker).
 */
export async function runEchoAgent(payload: AgentJobPayload): Promise<unknown> {
  const userText = JSON.stringify(payload.input);
  const model = payload.model ?? "openai/gpt-4o-mini";
  const content = await chat({
    model,
    messages: [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: userText },
    ],
  });
  return { model, content };
}
