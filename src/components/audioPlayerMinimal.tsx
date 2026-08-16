'use client'

import { Music } from 'lucide-react'
import { cn } from '@/lib/utils/utils'

interface AudioPlayerMinimalProps {
  /** Audio source URL (e.g. the authenticated media pipe path) */
  src: string
  title?: string
  className?: string
}

/**
 * Minimal inline audio player tag for note attachments — a compact card with
 * native controls, so audio files play without leaving the feed.
 */
export function AudioPlayerMinimal({ src, title, className }: AudioPlayerMinimalProps) {
  return (
    <div className={cn('flex items-center gap-2 rounded-md border bg-muted/40 px-2 py-1.5', className)}>
      <Music className="h-4 w-4 flex-shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1">
        {title && <p className="truncate text-xs text-muted-foreground">{title}</p>}
        <audio controls preload="metadata" src={src} className="h-8 w-full" />
      </div>
    </div>
  )
}
