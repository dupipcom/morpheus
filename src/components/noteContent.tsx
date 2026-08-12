'use client'

import { useMemo } from 'react'
import type { ReactNode } from 'react'
import { LinkPreview } from '@/components/linkPreview'
import { createUrlRegex, extractUrls } from '@/lib/utils/linkPreview'

interface NoteContentProps {
  content: string
  truncate?: boolean
  maxLength?: number
  /** Optional slot rendered between text and link previews (e.g. expand button) */
  children?: ReactNode
}

/**
 * Render text segments, turning each URL into a styled <a> tag.
 */
function renderTextWithLinks(text: string) {
  const urlRegex = createUrlRegex()
  const parts: ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = urlRegex.exec(text)) !== null) {
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

export function NoteContent({ content, truncate = false, maxLength = 150, children }: NoteContentProps) {
  const displayContent = useMemo(() => {
    if (!truncate || content.length <= maxLength) return content
    return `${content.slice(0, maxLength)}...`
  }, [content, truncate, maxLength])

  // Always extract URLs from full content (not truncated) and limit to 3,
  // so preview badges are visible regardless of fold/expand state.
  const urls = useMemo(() => extractUrls(content).slice(0, 3), [content])

  return (
    <div>
      <p className="text-sm whitespace-pre-wrap mb-1">
        {renderTextWithLinks(displayContent)}
      </p>
      {children}
      {urls.map((url) => (
        <LinkPreview key={url} url={url} />
      ))}
    </div>
  )
}
