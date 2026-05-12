/**
 * Naïve token-aware chunker. Approximates 1 token ≈ 4 characters.
 * Replace with tiktoken when you need accurate token boundaries.
 */
export interface ChunkOptions {
  chunkSize?: number; // characters
  chunkOverlap?: number; // characters
}

export function chunkText(input: string, opts: ChunkOptions = {}): string[] {
  const chunkSize = opts.chunkSize ?? 1500;
  const overlap = Math.min(opts.chunkOverlap ?? 200, chunkSize - 1);
  if (input.length <= chunkSize) return [input];

  const chunks: string[] = [];
  let start = 0;
  while (start < input.length) {
    const end = Math.min(start + chunkSize, input.length);
    chunks.push(input.slice(start, end));
    if (end === input.length) break;
    start = end - overlap;
  }
  return chunks;
}

export function approxTokenCount(s: string): number {
  return Math.ceil(s.length / 4);
}
