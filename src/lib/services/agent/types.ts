/**
 * Agent Service Types
 * Shared types for the DeepSeek assistant RAG pipeline (chat + hint consumers)
 */

import type { MoodKey } from '@/lib/services/day'
import type { NoteVisibility } from '@/generated/prisma/client'

/** All dimensions the assistant can be asked about (mirrors the dashboard charts) */
export const AGENT_DIMENSIONS = [
  'moodAverage',
  'gratitude',
  'optimism',
  'restedness',
  'tolerance',
  'selfEsteem',
  'trust',
  'progress',
  'profit',
  'stash',
  'withdrawn',
  'balance'
] as const

export type AgentDimension = typeof AGENT_DIMENSIONS[number]

/** Mood sub-dimensions living on the embedded Day.mood document */
export const MOOD_DIMENSIONS: MoodKey[] = ['gratitude', 'optimism', 'restedness', 'tolerance', 'selfEsteem', 'trust']

/**
 * Client → server contract. The dashboard sends this with every chat turn;
 * the server validates it and builds the MongoDB query from it.
 * Nothing here is trusted before validation (dates, userId, dimensions).
 */
export interface AgentFilterContext {
  startDate: string // YYYY-MM-DD
  endDate: string // YYYY-MM-DD
  userId?: string // internal Prisma User id of the target (self or delegated)
  dimensions?: AgentDimension[] // whitelisted subset; undefined → default select
}

/** Filter context after server-side validation + delegation resolution */
export interface ResolvedAgentContext {
  targetUserId: string
  userLabel: string // 'you' vs 'the delegated user' — never names/emails (PII)
  startDate: string
  endDate: string
  dimensions: AgentDimension[]
  visibilityFilter?: Array<'PUBLIC' | 'FRIENDS' | 'CLOSE_FRIENDS'> // restricted delegation scopes
  /** Note visibility allow-list for the requester; undefined = full (owner) */
  noteVisibilityFilter?: NoteVisibility[]
  isRestricted: boolean
}

export interface CompactTask {
  name: string
  area: string | null
  status: string
  count?: number | null
  times?: number | null
}

/** The only user-data shape the assistant ever sees */
export interface CompactDay {
  date: string
  week: number | null
  month: number | null
  average?: number | null
  mood?: Partial<Record<MoodKey, number>>
  progress?: number | null
  profit?: number | null
  stash?: number | null
  withdrawn?: number | null
  balance?: number | null
  tasks: CompactTask[]
}

export interface DayChunk {
  id: string
  text: string
  startDate: string
  endDate: string
  level: 'week' | 'month' | 'year' | 'note'
}

/** Compact note payload fed to the note chunker */
export interface CompactNote {
  id: string
  date: string | null
  content: string
}

export interface DocChunk {
  id: string
  heading: string | null
  text: string
}

export interface RagResult {
  userChunks: DayChunk[]
  docChunks: DocChunk[]
  usedEmbeddings: boolean // false → embedding fallback (recency) was taken
  dimensionList: AgentDimension[]
}
