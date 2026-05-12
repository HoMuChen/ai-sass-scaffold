import OpenAI from "openai";

/**
 * OpenRouter speaks the OpenAI Chat Completions wire format, so we reuse the
 * official SDK with a custom baseURL. Per blueprint §3 packages/ai.
 */
function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} env var is required`);
  return v;
}

export const openrouter = new OpenAI({
  apiKey: requireEnv("OPENROUTER_API_KEY"),
  baseURL: process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1",
  defaultHeaders: {
    // Optional but recommended by OpenRouter for attribution & rate limits.
    "HTTP-Referer": process.env.OPENROUTER_REFERER ?? "http://localhost",
    "X-Title": process.env.OPENROUTER_APP_NAME ?? "ai-sass-scaffold",
  },
});

export interface ChatOptions {
  model: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  temperature?: number;
  maxTokens?: number;
}

export async function chat(opts: ChatOptions): Promise<string> {
  const res = await openrouter.chat.completions.create({
    model: opts.model,
    messages: opts.messages,
    temperature: opts.temperature ?? 0.2,
    max_tokens: opts.maxTokens,
    stream: false,
  });
  return res.choices[0]?.message?.content ?? "";
}

/** Streaming variant — yields content deltas as they arrive. */
export async function* chatStream(opts: ChatOptions): AsyncGenerator<string> {
  const stream = await openrouter.chat.completions.create({
    model: opts.model,
    messages: opts.messages,
    temperature: opts.temperature ?? 0.2,
    max_tokens: opts.maxTokens,
    stream: true,
  });
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) yield delta;
  }
}
