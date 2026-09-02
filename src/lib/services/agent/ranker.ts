/**
 * LLM-based retrieval ranking for the per-request RAG context. DeepSeek has
 * no embeddings API (discontinued Aug 2026), so the cosine vector space is
 * replaced by a lexical pre-filter plus a single DeepSeek JSON-mode
 * relevance-ranking call. Everything is in-memory per request and discarded —
 * nothing is persisted. On any failure the callers fall back to
 * lexical/recency retrieval so chat keeps working.
 */

import { z } from 'zod'
import { DEEPSEEK_CHAT_MODEL, getDeepseekOpenAI } from '@/lib/deepseek'

/** Max candidates handed to the LLM ranker per request */
const RANK_CANDIDATES = 20

/** Per-call cap so a slow ranker degrades instead of eating the Vercel budget */
const RANK_TIMEOUT_MS = 15_000

const STOPWORDS = new Set([
  'a', 'an', 'the', 'of', 'to', 'in', 'is', 'are', 'and', 'or', 'on', 'with', 'for',
  'this', 'that', 'these', 'those', 'from', 'by', 'at', 'as', 'it', 'its', 'be', 'was',
  'were', 'my', 'me', 'i', 'you', 'your', 'yours', 'he', 'she', 'they', 'we', 'our',
  'do', 'does', 'did', 'have', 'has', 'had', 'not', 'no', 'but', 'what', 'when',
  'where', 'which', 'who', 'how', 'why', 'can', 'could', 'should', 'would', 'will',
  'about', 'than', 'then', 'so', 'if', 'into', 'over', 'under', 'up', 'down', 'out',
  'all', 'any', 'some', 'more', 'most', 'there', 'their', 'them', 'us', 'am'
])

/** Cheap keyword overlap score; heading hits count double (0 = no overlap) */
export function lexicalScore(query: string, text: string, heading?: string | null): number {
  const terms = query
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((term) => term.length > 2 && !STOPWORDS.has(term))
  if (terms.length === 0) return 0

  const body = text.toLowerCase()
  const head = (heading || '').toLowerCase()
  let score = 0
  for (const term of terms) {
    if (body.includes(term)) score += 1
    if (head.includes(term)) score += 2
  }
  return score
}

const RANK_SCHEMA = z.object({
  indices: z.array(z.coerce.number())
})

/**
 * One DeepSeek JSON-mode call that ranks candidate passages by relevance to
 * the query. Returns the indices of the top passages (into `texts`), best
 * first, or null when the model output is unusable or the call fails.
 */
async function llmRankCandidates(
  query: string,
  texts: string[],
  k: number
): Promise<number[] | null> {
  const passages = texts.map((text, index) => `[${index}] ${text}`).join('\n\n')

  try {
    const completion = await getDeepseekOpenAI().chat.completions.create(
      {
        model: DEEPSEEK_CHAT_MODEL,
        messages: [
          {
            role: 'system',
            content:
              'You rank text passages by relevance to a query. ' +
              'Return ONLY a JSON object of the form {"indices": [...]} where each value is ' +
              'the 0-based number of a passage, ordered from most to least relevant. ' +
              `Include at most ${k} passages and only those genuinely relevant to the query; fewer is fine.`
          },
          {
            role: 'user',
            content: `Query: ${query.slice(0, 500)}\n\nPassages:\n${passages}`
          }
        ],
        response_format: { type: 'json_object' },
        max_tokens: 256,
        temperature: 0
      },
      { timeout: RANK_TIMEOUT_MS }
    )

    const raw = completion.choices[0]?.message?.content
    if (!raw) return null

    const parsed = RANK_SCHEMA.safeParse(JSON.parse(raw))
    if (!parsed.success) return null

    const seen = new Set<number>()
    const indices: number[] = []
    for (const value of parsed.data.indices) {
      const index = Math.floor(value)
      if (index >= 0 && index < texts.length && !seen.has(index)) {
        seen.add(index)
        indices.push(index)
      }
      if (indices.length >= k) break
    }
    return indices.length > 0 ? indices : null
  } catch (error) {
    console.error('llm_rank_failure', {
      error: error instanceof Error ? error.message : 'Unknown error'
    })
    return null
  }
}

/**
 * Rank texts against a query. Lexical pre-filter bounds the LLM call to the
 * best RANK_CANDIDATES entries; the LLM then re-ranks them (JSON mode), with
 * a lexical fallback when the call fails. Returns the indices (into `texts`)
 * of the top-k most relevant entries, sorted by descending relevance — or
 * null when nothing matches (caller applies its recency fallback).
 */
export async function retrieveTopK(
  query: string,
  texts: string[],
  k: number
): Promise<number[] | null> {
  if (texts.length === 0) return []

  const candidates = texts
    .map((text, index) => ({ index, score: lexicalScore(query, text) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)

  if (candidates.length === 0) return null
  if (candidates.length <= k) return candidates.map((entry) => entry.index)

  const topCandidates = candidates.slice(0, RANK_CANDIDATES)
  const ranked = await llmRankCandidates(
    query,
    topCandidates.map((entry) => texts[entry.index]),
    k
  )
  if (!ranked) return topCandidates.slice(0, k).map((entry) => entry.index)
  return ranked.map((position) => topCandidates[position].index)
}
