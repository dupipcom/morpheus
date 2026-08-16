/**
 * Chunking for token limits.
 * Compact days are grouped into week/month/year chunks (coarsened when the
 * range is large or the chunk count exceeds the cap); raw text (the psych
 * reference doc) is split by character budget with paragraph-aware breaks.
 */

import { getWeekNumber } from '@/app/helpers'
import { dayChunkText } from './daySelect'
import type { CompactDay, CompactNote, DayChunk } from './types'

export const MAX_CHUNKS = 150
/** Per-chunk token budget (≈375 tokens ≈ 1,500 chars via the chars/4 heuristic) */
export const MAX_CHUNK_TOKENS = 375
export const MAX_SPLIT_DEPTH = 3
/** Cap for note chunks inside the shared MAX_CHUNKS budget (days come first) */
export const MAX_NOTE_CHUNKS = 40

/** Rough English heuristic — no tokenizer dependency */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

function isoWeekKey(date: string): string {
  const { year: isoYear, week } = getWeekNumber(new Date(`${date}T00:00:00Z`))
  return `${isoYear}-w${String(week).padStart(2, '0')}`
}

export function chunkCompactDays(days: CompactDay[]): DayChunk[] {
  if (days.length === 0) return []

  const grouping: DayChunk['level'] = days.length <= 365 ? 'week' : 'month'
  let chunks = groupAndChunk(days, grouping)

  if (chunks.length > MAX_CHUNKS && grouping === 'week') {
    chunks = groupAndChunk(days, 'month')
  }
  if (chunks.length > MAX_CHUNKS) {
    chunks = groupAndChunk(days, 'year')
  }

  return chunks.slice(0, MAX_CHUNKS)
}

function groupAndChunk(days: CompactDay[], grouping: DayChunk['level']): DayChunk[] {
  const groups = new Map<string, CompactDay[]>()
  for (const day of days) {
    const key =
      grouping === 'week' ? isoWeekKey(day.date) : day.date.slice(0, grouping === 'month' ? 7 : 4)
    const group = groups.get(key) || []
    group.push(day)
    groups.set(key, group)
  }

  const sorted = [...groups.entries()].sort((a, b) => a[1][0].date.localeCompare(b[1][0].date))
  const chunks: DayChunk[] = []
  for (const [key, group] of sorted) {
    chunks.push(...splitGroup(key, group, grouping, 0))
  }
  return chunks
}

function splitGroup(
  key: string,
  group: CompactDay[],
  grouping: DayChunk['level'],
  depth: number
): DayChunk[] {
  const text = group.map(dayChunkText).join('\n')

  if (estimateTokens(text) <= MAX_CHUNK_TOKENS || group.length === 1 || depth >= MAX_SPLIT_DEPTH) {
    return [
      {
        id: `${grouping}-${key}${depth > 0 ? `-${depth}` : ''}`,
        text,
        startDate: group[0].date,
        endDate: group[group.length - 1].date,
        level: grouping
      }
    ]
  }

  const mid = Math.ceil(group.length / 2)
  return [
    ...splitGroup(key, group.slice(0, mid), grouping, depth + 1),
    ...splitGroup(key, group.slice(mid), grouping, depth + 1)
  ]
}

/**
 * Chunk the requester's authorized notes for the shared RAG pool.
 * One chunk per note (split when oversized), prefixed with the note date so
 * the assistant can reason about when the note was written. Undated notes
 * sort last in the recency fallback.
 */
export function chunkNotes(notes: CompactNote[]): DayChunk[] {
  if (notes.length === 0) return []

  const chunks: DayChunk[] = []
  for (const note of notes) {
    const dateLabel = note.date ?? 'undated'
    const parts = chunkRawText(note.content)
    const texts = parts.length > 0 ? parts : [note.content]

    texts.slice(0, MAX_NOTE_CHUNKS - chunks.length).forEach((text, index) => {
      if (chunks.length >= MAX_NOTE_CHUNKS) return
      chunks.push({
        id: `note-${note.id}${index > 0 ? `-${index}` : ''}`,
        text: `[${dateLabel}] ${text}`,
        startDate: dateLabel,
        endDate: dateLabel,
        level: 'note'
      })
    })
  }

  return chunks
}

/**
 * Split raw text into character-budgeted chunks, preferring paragraph breaks
 * when possible. Used for the cognitive-psychology reference document.
 */
export function chunkRawText(
  text: string,
  options?: { size?: number; overlap?: number }
): string[] {
  const size = options?.size ?? 1400
  const overlap = options?.overlap ?? 100

  const trimmed = text.trim()
  if (trimmed.length <= size) return trimmed ? [trimmed] : []

  const chunks: string[] = []
  let start = 0
  while (start < trimmed.length) {
    let end = start + size
    if (end < trimmed.length) {
      // prefer a paragraph/line break in the second half of the window
      const window = trimmed.slice(start, end)
      const lastBreak = Math.max(window.lastIndexOf('\n\n'), window.lastIndexOf('\n'))
      if (lastBreak > size * 0.5) end = start + lastBreak + 1
    }
    const chunk = trimmed.slice(start, end).trim()
    if (chunk) chunks.push(chunk)
    if (end >= trimmed.length) break
    start = end - overlap
  }

  return chunks
}
