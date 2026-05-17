'use client'

import { useMemo } from 'react'
import type { ReactNode } from 'react'
import { LinkPreview } from '@/components/linkPreview'

interface NoteContentProps {
  content: string
  truncate?: boolean
  maxLength?: number
}

const URL_REGEX = /https?:\/\/(?:[-\w]+\.)+[a-z]{2,}(?:\/[^\s]*)?/gi

/**
 * Extract unique URLs from a string.
 */
export function extractUrls(text: string): string[] {
  const matches = text.match(URL_REGEX)
  if (!matches) return []
  // Deduplicate while preserving order
  return [...new Set(matches)]
}

/**
 * Render text segments, turning each URL into a styled <a> tag.
 */
function renderTextWithLinks(text: string) {
  const parts: ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  // Reset regex state
  URL_REGEX.lastIndex = 0

  while ((match = URL_REGEX.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }
    const href = match[0]
    parts.push(
      <a
        key={`${href}-${match.index}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary underline break-all"
        onClick={(e) => e.stopPropagation()}
      >
        {href}
      </a>
    )
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }

  return parts
}

export function NoteContent({ content, truncate = false, maxLength = 150 }: NoteContentProps) {
  const displayContent = useMemo(() => {
    if (!truncate || content.length <= maxLength) return content
    return `${content.slice(0, maxLength)}...`
  }, [content, truncate, maxLength])

  const urls = useMemo(() => extractUrls(content), [content])

  return (
    <div>
      <p className="text-sm whitespace-pre-wrap mb-1">
        {renderTextWithLinks(displayContent)}
      </p>
      {urls.map((url) => (
        <LinkPreview key={url} url={url} />
      ))}
    </div>
  )
}
