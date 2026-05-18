'use client'

import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { ExternalLink } from 'lucide-react'
import type { LinkPreviewData } from '@/app/api/v1/link-preview/route'
import { useI18n } from '@/lib/contexts/i18n'
import { getMediaEmbedConfig } from '@/lib/utils/linkPreview'

interface LinkPreviewProps {
  url: string
}

export function LinkPreview({ url }: LinkPreviewProps) {
  const { t, hasTranslation } = useI18n()
  const [data, setData] = useState<LinkPreviewData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const mediaEmbed = useMemo(() => getMediaEmbedConfig(url), [url])
  const embedStyle = mediaEmbed?.aspectRatio
    ? { aspectRatio: mediaEmbed.aspectRatio }
    : mediaEmbed?.minHeight
      ? { minHeight: mediaEmbed.minHeight }
      : {}
  const translatedEmbedHint = mediaEmbed && hasTranslation('mood.publish.embedHint')
    ? t('mood.publish.embedHint', { provider: mediaEmbed.providerLabel })
    : null
  const embedHint = mediaEmbed
    ? translatedEmbedHint || `${mediaEmbed.providerLabel} embed. If playback is unavailable, open the original link below.`
    : null

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(false)
    setData(null)

    fetch(`/api/v1/link-preview?url=${encodeURIComponent(url)}`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch preview')
        return res.json()
      })
      .then((json: LinkPreviewData) => {
        if (!cancelled) {
          setData(json)
          setLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(true)
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [url])

  const previewCard = loading ? (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 mt-2 p-3 rounded-lg border border-border/60 bg-muted/40 text-xs text-muted-foreground hover:bg-muted/70 transition-colors no-underline"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="h-3 w-3 rounded-full bg-muted-foreground/30 animate-pulse flex-shrink-0" />
      <span className="truncate">{url}</span>
      <ExternalLink className="h-3 w-3 flex-shrink-0 ml-auto" />
    </a>
  ) : error || !data ? (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 mt-2 p-3 rounded-lg border border-border/60 bg-muted/40 text-xs text-primary hover:bg-muted/70 transition-colors no-underline"
      onClick={(e) => e.stopPropagation()}
    >
      <ExternalLink className="h-3 w-3 flex-shrink-0" />
      <span className="truncate">{url}</span>
    </a>
  ) : (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="block mt-2 rounded-lg border border-border/60 bg-muted/40 hover:bg-muted/70 transition-colors overflow-hidden no-underline"
      onClick={(e) => e.stopPropagation()}
    >
      {!!data.image && (
        <div className="relative w-full" style={{ aspectRatio: '1200/630' }}>
          <Image
            src={data.image}
            alt={data.title || url}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 400px"
            unoptimized
          />
        </div>
      )}
      <div className="p-3 space-y-1">
        <div className="flex items-center gap-2">
          {data.favicon && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={data.favicon}
              alt=""
              className="h-4 w-4 rounded-sm flex-shrink-0 object-contain"
              onError={(e) => {
                e.currentTarget.style.display = 'none'
              }}
            />
          )}
          <span className="text-[10px] text-muted-foreground truncate">{data.siteName || new URL(url).hostname}</span>
          <ExternalLink className="h-3 w-3 flex-shrink-0 ml-auto text-muted-foreground" />
        </div>
        {data.title && (
          <p className="text-sm font-medium leading-snug line-clamp-2">{data.title}</p>
        )}
        {data.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">{data.description}</p>
        )}
      </div>
    </a>
  )

  return (
    <>
      {mediaEmbed && (
        <div className="mt-2 overflow-hidden rounded-lg border border-border/60 bg-card">
          <div className="relative w-full overflow-hidden bg-black/5" style={embedStyle}>
            <iframe
              src={mediaEmbed.embedUrl}
              title={mediaEmbed.title}
              className="h-full w-full border-0"
              loading="lazy"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; fullscreen; gyroscope; picture-in-picture"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
              sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-presentation"
            />
          </div>
          <div className="border-t border-border/60 bg-muted/30 px-3 py-2 text-[10px] text-muted-foreground">
            {embedHint}
          </div>
        </div>
      )}
      {previewCard}
    </>
  )
}
