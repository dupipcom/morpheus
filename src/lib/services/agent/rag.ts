/**
 * RAG orchestrator shared by the assistant chat and the hint route:
 * fetch compact days (minimal select) → chunk → embed → cosine top-K,
 * plus bounded psychology-doc retrieval. The vector space lives only for
 * the duration of the request (in-memory, Vercel serverless).
 */

import prisma from '@/lib/prisma'
import { chunkCompactDays, MAX_CHUNKS } from './chunker'
import { buildDaySelectForDimensions, buildDayWhere, compactDay } from './daySelect'
import type { AgentDayRecord } from './daySelect'
import { retrieveTopK } from './embeddings'
import { pickDocChunksForQuery } from './psychDoc'
import type {
  AgentDimension,
  CompactDay,
  CompactNote,
  DayChunk,
  DocChunk,
  RagResult,
  ResolvedAgentContext
} from './types'

const DEFAULT_USER_TOP_K = 10
const DEFAULT_DOC_TOP_K = 4
const MAX_COMPACT_NOTES = 100

export interface BuildRagOptions {
  dimensions?: AgentDimension[]
  userChunkTopK?: number
  docChunkTopK?: number
  /** Pre-chunked notes (from chunkNotes) to pool with day chunks */
  noteChunks?: DayChunk[]
}

/** Fetch the minimal Day payload for the resolved context and compact it */
export async function fetchCompactDays(ctx: ResolvedAgentContext): Promise<CompactDay[]> {
  const days = await prisma.day.findMany({
    where: buildDayWhere(ctx.targetUserId, ctx.startDate, ctx.endDate, ctx.visibilityFilter),
    select: buildDaySelectForDimensions(ctx.dimensions),
    orderBy: { date: 'asc' }
  })

  return days
    .map((day) => compactDay(day as AgentDayRecord, ctx.dimensions))
    .filter((day): day is CompactDay => day !== null)
}

/**
 * Fetch the target user's notes the requester is authorized to read.
 * `noteVisibilityFilter` is undefined for the owner (full access) and an
 * allow-list for delegated viewers (see resolveNoteVisibilityFilter).
 * Only notes with `aiEnabled = true` (or the legacy `visibility = AI_ENABLED`)
 * are ever surfaced to the RAG — notes without the AI toggle are excluded
 * regardless of visibility or delegation scope.
 * Undated notes are included regardless of the date range — the range still
 * applies to dated notes; the result is bounded by MAX_COMPACT_NOTES.
 */
export async function fetchCompactNotes(ctx: ResolvedAgentContext): Promise<CompactNote[]> {
  const notes = await prisma.note.findMany({
    where: {
      userId: ctx.targetUserId,
      ...(ctx.noteVisibilityFilter ? { visibility: { in: ctx.noteVisibilityFilter } } : {}),
      AND: [
        // Only notes the owner has opted into AI (new toggle) or legacy AI_ENABLED visibility
        { OR: [{ aiEnabled: true }, { visibility: 'AI_ENABLED' }] },
        // Date range filter: dated notes must fall within the window; undated are always included
        { OR: [{ date: { gte: ctx.startDate, lte: ctx.endDate } }, { date: null }] }
      ]
    },
    select: { id: true, date: true, content: true },
    orderBy: { createdAt: 'desc' },
    take: MAX_COMPACT_NOTES
  })

  return notes.map((note) => ({ id: note.id, date: note.date, content: note.content }))
}

/**
 * Build the per-request RAG context: chunk the compact days, retrieve the
 * top-K most relevant chunks (cosine on deepseek-embed), and pull bounded
 * psychology-doc excerpts. Falls back to the most recent chunks when
 * embeddings are unavailable so the chat keeps working.
 */
export async function buildRagForQuery(
  compactDays: CompactDay[],
  query: string,
  options: BuildRagOptions = {}
): Promise<RagResult> {
  const dimensions = options.dimensions ?? []
  const userChunkTopK = options.userChunkTopK ?? DEFAULT_USER_TOP_K
  const docChunkTopK = options.docChunkTopK ?? DEFAULT_DOC_TOP_K

  // Day chunks come first; note chunks fill the remainder of the budget
  const allChunks = [...chunkCompactDays(compactDays), ...(options.noteChunks ?? [])].slice(
    0,
    MAX_CHUNKS
  )
  let userChunks: DayChunk[] = []
  let docChunks: DocChunk[] = []
  let usedEmbeddings = false

  if (allChunks.length > 0) {
    const topIndices =
      query.trim().length > 0
        ? await retrieveTopK(query, allChunks.map((chunk) => chunk.text), userChunkTopK)
        : null

    if (topIndices) {
      userChunks = topIndices.map((index) => allChunks[index])
      usedEmbeddings = true
    } else {
      // Recency fallback: most recent chunks still give useful context
      userChunks = [...allChunks]
        .sort((a, b) => b.endDate.localeCompare(a.endDate))
        .slice(0, userChunkTopK)
    }
  }

  if (usedEmbeddings && query.trim().length > 0) {
    docChunks = await pickDocChunksForQuery(query, docChunkTopK)
  }

  return { userChunks, docChunks, usedEmbeddings, dimensionList: dimensions }
}
