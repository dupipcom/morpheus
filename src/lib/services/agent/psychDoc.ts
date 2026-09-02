/**
 * Cognitive-psychology reference document handling.
 *
 * The doc (rag/cognitive-psychology-archiveorg.md) is an ~18k-line raw
 * archive.org OCR dump: a TOC preamble, chapters starting with numbered
 * headings (e.g. "1 Cognitive Psychology and the Brain"), wiki boilerplate,
 * and a GPL/GFDL license appendix. It is split on heading boundaries at
 * module load (cached per warm serverless instance, keyed by file mtime),
 * then filtered and ranked per query.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { chunkRawText } from './chunker'
import { lexicalScore } from './ranker'
import type { DocChunk } from './types'

const PSYCH_DOC_PATH = path.join(
  process.cwd(),
  'src/app/api/v1/hint/rag/cognitive-psychology-archiveorg.md'
)

/** Lines of TOC/boilerplate preamble to skip */
const TOC_PREAMBLE_LINES = 266
const DOC_CHUNK_SIZE = 1400
const DOC_CHUNK_OVERLAP = 100
const MAX_CANDIDATES = 15

/** Chapter/section heading markers, e.g. "1.2 Title", "12.3.4 Title" */
const BOUNDARY_RE = /^\d+(\.\d+)*\s+\S/

/** License appendix and wiki boilerplate signatures */
const BOILERPLATE_RE =
  /GNU GENERAL PUBLIC LICENSE|GFDL|Wikibooks|wikipedia\.org|Skip to main content|Creative Commons|GFDL License/i

const cache: { mtime: string | null; chunks: DocChunk[] | null } = { mtime: null, chunks: null }

/** Split the raw doc into section-aligned, boilerplate-free chunks */
export async function loadPsychDocChunks(): Promise<DocChunk[]> {
  const stat = await fs.stat(PSYCH_DOC_PATH)
  const mtime = String(stat.mtimeMs)
  if (cache.mtime === mtime && cache.chunks) return cache.chunks

  const content = await fs.readFile(PSYCH_DOC_PATH, 'utf8')
  const body = content.split('\n').slice(TOC_PREAMBLE_LINES)

  const sections: Array<{ heading: string | null; text: string }> = []
  let currentHeading: string | null = null
  let currentLines: string[] = []

  const flush = () => {
    const text = currentLines.join('\n').trim()
    if (text) sections.push({ heading: currentHeading, text })
    currentLines = []
  }

  for (const line of body) {
    if (BOUNDARY_RE.test(line)) {
      flush()
      currentHeading = line.trim().slice(0, 80)
      currentLines = [line]
    } else {
      currentLines.push(line)
    }
  }
  flush()

  const chunks: DocChunk[] = []
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i]
    const pieces = chunkRawText(section.text, { size: DOC_CHUNK_SIZE, overlap: DOC_CHUNK_OVERLAP })
    for (const piece of pieces) {
      const alphaRatio = piece.replace(/[^a-zA-Z]/g, '').length / Math.max(piece.length, 1)
      if (alphaRatio < 0.4) continue
      if (BOILERPLATE_RE.test(piece.slice(0, 200))) continue
      chunks.push({ id: `doc-${chunks.length}`, heading: section.heading, text: piece })
    }
  }

  cache.mtime = mtime
  cache.chunks = chunks
  return chunks
}

/**
 * Pick the doc chunks most relevant to the query by lexical ranking (heading
 * hits count double). Returns [] when the doc cannot be read at all.
 */
export async function pickDocChunksForQuery(
  query: string,
  topN = 4,
  candidateCount = MAX_CANDIDATES
): Promise<DocChunk[]> {
  try {
    const all = await loadPsychDocChunks()
    const candidates = all
      .map((chunk) => ({ chunk, score: lexicalScore(query, chunk.text, chunk.heading) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, candidateCount)

    return candidates.slice(0, topN).map((entry) => entry.chunk)
  } catch (error) {
    console.error('psych_doc_chunk_failure', {
      error: error instanceof Error ? error.message : 'Unknown error'
    })
    return []
  }
}
