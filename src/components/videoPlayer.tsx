'use client'

import { cn } from '@/lib/utils/utils'

interface VideoPlayerProps {
  /** Video source URL (e.g. the authenticated media pipe path) */
  src: string
  /** Poster frame URL (stored on Document.posterUrl) */
  poster?: string
  title?: string
  className?: string
}

/**
 * Reusable HTML5 video player for attachment evidence and note media.
 * Native controls; `preload="metadata"` + `playsInline` keep mobile behavior sane.
 */
export function VideoPlayer({ src, poster, title, className }: VideoPlayerProps) {
  return (
    <figure className={cn('overflow-hidden rounded-md border bg-black/5', className)}>
      <video
        controls
        playsInline
        preload="metadata"
        poster={poster}
        src={src}
        className="w-full aspect-video bg-black"
      />
      {title && (
        <figcaption className="truncate px-2 py-1 text-xs text-muted-foreground">
          {title}
        </figcaption>
      )}
    </figure>
  )
}
