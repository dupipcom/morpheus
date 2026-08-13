/**
 * DeepSeek embeddings (deepseek-embed) + cosine similarity for the per-request
 * vector space. Everything is in-memory and discarded after the request —
 * nothing is persisted. On any embedding failure the callers fall back to
 * recency-based retrieval so chat keeps working.
 */

import { DEEPSEEK_EMBED_MODEL, getDeepseekOpenAI } from '@/lib/deepseek'

export const EMBED_BATCH_SIZE = 32

/**
 * Embed texts in batches. Returns one vector per input text, in order,
 * or null when embeddings are unavailable (missing key, API failure).
 * Never logs content — counts only.
 */
export async function embedTexts(
  texts: string[],
  batchSize: number = EMBED_BATCH_SIZE
): Promise<number[][] | null> {
  if (texts.length === 0) return []
  if (!process.env.DEEPSEEK_API_KEY) return null

  const client = getDeepseekOpenAI()
  const results: number[][] = []

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize)
    let embedded: number[][] | null = null

    try {
      const response = await client.embeddings.create({
        model: DEEPSEEK_EMBED_MODEL,
        input: batch
      })
      embedded = response.data
        .slice()
        .sort((a, b) => a.index - b.index)
        .map((item) => item.embedding)
    } catch {
      if (batchSize > 1) {
        // Degrade: embed one item at a time so a single bad input does not
        // drop the whole batch. Any loss breaks index alignment → null.
        embedded = []
        let failed = 0
        for (const text of batch) {
          try {
            const response = await client.embeddings.create({
              model: DEEPSEEK_EMBED_MODEL,
              input: [text]
            })
            embedded.push(response.data[0].embedding)
          } catch {
            failed += 1
          }
        }
        console.error('deepseek_embedding_partial_failure', { failed })
        if (failed > 0) embedded = null
      }
    }

    if (!embedded) return null
    results.push(...embedded)
  }

  return results.length === texts.length ? results : null
}

/** Cosine similarity between two same-length vectors; 0 on degenerate input */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

/**
 * Rank texts against a query. Returns the indices (into `texts`) of the top-k
 * most similar entries, sorted by descending similarity — or null when
 * embeddings are unavailable (caller applies its fallback).
 */
export async function retrieveTopK(
  query: string,
  texts: string[],
  k: number
): Promise<number[] | null> {
  if (texts.length === 0) return []
  const all = await embedTexts([query, ...texts])
  if (!all) return null

  const [queryEmbedding, ...chunkEmbeddings] = all
  const scored = chunkEmbeddings.map((embedding, index) => ({
    index,
    score: cosineSimilarity(queryEmbedding, embedding)
  }))
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, k).map((entry) => entry.index)
}
