import OpenAI from "openai";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} env var is required`);
  return v;
}

// Embeddings go directly to OpenAI (blueprint §3 - multimedia / embedding lane).
const openai = new OpenAI({ apiKey: requireEnv("OPENAI_API_KEY") });

export const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL ?? "text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 1536; // matches packages/db schema vector dim

export async function embed(input: string | string[]): Promise<number[][]> {
  const arr = Array.isArray(input) ? input : [input];
  if (arr.length === 0) return [];
  const res = await openai.embeddings.create({ model: EMBEDDING_MODEL, input: arr });
  return res.data.map((d) => d.embedding);
}

export async function embedOne(input: string): Promise<number[]> {
  const [v] = await embed([input]);
  if (!v) throw new Error("embedding API returned empty result");
  return v;
}
