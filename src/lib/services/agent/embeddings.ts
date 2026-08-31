/**
 * Embeddings + cosine similarity for the per-request vector space. Everything
 * is in-memory and discarded after the request — nothing is persisted. On any
 * embedding failure the callers fall back to recency-based retrieval so chat
 * keeps working.
 *
 * Primary provider: Telnyx Inference embeddings (thenlper/gte-large, 1024-dim,
 * OpenAI-compatible endpoint) — DeepSeek discontinued its embeddings API in
 * Aug 2026. DeepSeek remains as a legacy fallback when the key is set and
 * Telnyx is unavailable.
 */

import OpenAI from 'openai'
import { DEEPSEEK_EMBED_MODEL, getDeepseekOpenAI } from '@/lib/deepseek'
import { TELNYX_EMBED_MODEL, getTelnyxEmbeddingsOpenAI } from '@/lib/services/mcp/telnyxClient'

export const EMBED_BATCH_SIZE = 32

/**
 * Embed texts in batches with one client/model. Returns one vector per input
 * text, in order, or null when unavailable. Never logs content — counts only.
 */
async function embedWithClient(
  client: OpenAI,
  model: string,
  texts: string[],
  batchSize: number
): Promise<number[][] | null> {
  const results: number[][] = []

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize)
    let embedded: number[][] | null = null

    try {
      const response = await client.embeddings.create({
        model,
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
              model,
              input: [text]
            })
            embedded.push(response.data[0].embedding)
          } catch {
            failed += 1
          }
        }
        console.error('embedding_partial_failure', { model, failed })
        if (failed > 0) embedded = null
      }
    }

    if (!embedded) return null
    results.push(...embedded)
  }

  return results.length === texts.length ? results : null
}

/**
 * Embed texts in batches. Returns one vector per input text, in order,
 * or null when embeddings are unavailable (missing keys, API failure).
 */
export async function embedTexts(
  texts: string[],
  batchSize: number = EMBED_BATCH_SIZE
): Promise<number[][] | null> {
  if (texts.length === 0) return []

  // Telnyx Inference is the primary provider; DeepSeek stays as a legacy
  // fallback for keys that still work.
  if (process.env.TELNYX_API_KEY) {
    const result = await embedWithClient(getTelnyxEmbeddingsOpenAI(), TELNYX_EMBED_MODEL, texts, batchSize)
    if (result) return result
  }
  if (process.env.DEEPSEEK_API_KEY) {
    const result = await embedWithClient(getDeepseekOpenAI(), DEEPSEEK_EMBED_MODEL, texts, batchSize)
    if (result) return result
  }

  return null
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
