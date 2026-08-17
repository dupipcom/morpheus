'use client'

import { FileText } from 'lucide-react'
import { cn } from '@/lib/utils/utils'
import { attachmentFileUrl } from '@/components/attachmentPicker'
import { VideoPlayer } from '@/components/videoPlayer'
import { AudioPlayerMinimal } from '@/components/audioPlayerMinimal'
import { useI18n } from '@/lib/contexts/i18n'

/** Minimal document metadata embedded in note payloads (see notes GET route). */
export interface NoteDocumentRef {
  id: string
  fileName?: string | null
  mimeType?: string | null
  kind?: string | null
  /** Video cover frame URL (storage base); streamed via ?poster=1 on the pipe */
  posterUrl?: string | null
  /** Attachment location (shareable past-upload; see PATCH /attachments/[id]) */
  location?: { lat: number; lng: number; placeId?: string; name?: string; address?: string } | null
}

interface NoteAttachmentsProps {
  documents?: NoteDocumentRef[] | null
  /** Max images rendered (extra images become a link) */
  maxImages?: number
  className?: string
}

const isImage = (d: NoteDocumentRef) => d.kind === 'image' || (d.mimeType || '').startsWith('image/')
const isVideo = (d: NoteDocumentRef) => d.kind === 'video' || (d.mimeType || '').startsWith('video/')
const isAudio = (d: NoteDocumentRef) => (d.mimeType || '').startsWith('audio/')

/**
 * Renders a note's attached documents inline:
 * - images → responsive grid (each opens full-size in a new tab)
 * - videos → VideoPlayer
 * - audio → AudioPlayerMinimal
 * - everything else (PDFs, documents) → download/view links
 *
 * Media streams through the authenticated pipe (GET /api/v1/attachments/[id]/file).
 */
export function NoteAttachments({ documents, maxImages = 4, className }: NoteAttachmentsProps) {
  const { t } = useI18n()
  if (!documents || documents.length === 0) return null

  const images = documents.filter(isImage)
  const videos = documents.filter(isVideo)
  const audios = documents.filter(isAudio)
  const others = documents.filter((d) => !isImage(d) && !isVideo(d) && !isAudio(d))

  return (
    <div className={cn('mt-2 space-y-2', className)}>
      {images.length > 0 && (
        <div className={cn('grid gap-1', images.length === 1 ? 'grid-cols-1' : 'grid-cols-2')}>
          {images.slice(0, maxImages).map((doc) => (
            <a
              key={doc.id}
              href={attachmentFileUrl(doc.id)}
              target="_blank"
              rel="noopener noreferrer"
              className="block overflow-hidden rounded-md border"
            >
              <img
                src={attachmentFileUrl(doc.id)}
                alt={doc.fileName || ''}
                loading="lazy"
                className="h-40 w-full object-cover"
              />
            </a>
          ))}
        </div>
      )}

      {videos.map((doc) => (
        <VideoPlayer
          key={doc.id}
          src={attachmentFileUrl(doc.id)}
          poster={doc.posterUrl ? `${attachmentFileUrl(doc.id)}?poster=1` : undefined}
          title={doc.fileName || undefined}
        />
      ))}

      {audios.map((doc) => (
        <AudioPlayerMinimal key={doc.id} src={attachmentFileUrl(doc.id)} title={doc.fileName || undefined} />
      ))}

      {others.map((doc) => (
        <a
          key={doc.id}
          href={attachmentFileUrl(doc.id)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm text-primary underline underline-offset-2 hover:no-underline"
        >
          <FileText className="h-4 w-4" aria-hidden />
          {doc.fileName || t('jobs.viewDocument', { defaultValue: 'View document' })}
        </a>
      ))}
    </div>
  )
}
