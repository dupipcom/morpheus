'use client'

import { useState } from 'react'
import { Trash2 } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useI18n } from '@/lib/contexts/i18n'
import type { VoicemailListItem } from '@/lib/services/voicemail'

interface VoicemailPlayerProps {
  voicemail: VoicemailListItem
  onPlayed: (id: string) => void
  onDeleted: (id: string) => void
}

/**
 * One voicemail in the /app/chat inbox (phase 12): caller + date, playable
 * audio (streamed through the authenticated route), summary and transcript.
 */
export function VoicemailPlayer({ voicemail, onPlayed, onDeleted }: VoicemailPlayerProps) {
  const { t, hasTranslation } = useI18n()
  const [deleting, setDeleting] = useState(false)

  const newLabel = hasTranslation('chat.voicemail.newBadge') ? t('chat.voicemail.newBadge') : 'New'
  const audioProcessingLabel = hasTranslation('chat.voicemail.audioProcessing') ? t('chat.voicemail.audioProcessing') : 'Audio is being processed.'
  const summaryLabel = hasTranslation('chat.voicemail.summary') ? t('chat.voicemail.summary') : 'Summary'
  const transcriptLabel = hasTranslation('chat.voicemail.transcript') ? t('chat.voicemail.transcript') : 'Transcript'
  const deleteLabel = hasTranslation('chat.voicemail.delete') ? t('chat.voicemail.delete') : 'Delete voicemail'
  const unknownCallerLabel = hasTranslation('chat.voicemail.unknownCaller') ? t('chat.voicemail.unknownCaller') : 'Unknown caller'

  const handleDelete = async () => {
    setDeleting(true)
    try {
      const response = await fetch(`/api/v1/voicemails/${voicemail.id}`, { method: 'DELETE' })
      if (response.ok) onDeleted(voicemail.id)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Card className="rounded-xl border border-border/60 bg-card p-4 shadow-sm">
      <CardContent className="space-y-3 p-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">
              {voicemail.callerName || voicemail.callerPhone || unknownCallerLabel}
            </p>
            <p className="text-xs text-muted-foreground">
              {new Date(voicemail.createdAt).toLocaleString()}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {!voicemail.readAt && <Badge variant="outline">{newLabel}</Badge>}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void handleDelete()}
              disabled={deleting}
              aria-label={deleteLabel}
              title={deleteLabel}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {voicemail.hasAudio ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <audio
            controls
            preload="metadata"
            className="w-full"
            src={`/api/v1/voicemails/${voicemail.id}/audio`}
            onPlay={() => onPlayed(voicemail.id)}
          />
        ) : (
          <p className="text-xs text-muted-foreground">{audioProcessingLabel}</p>
        )}

        {voicemail.summary && (
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{summaryLabel}</p>
            <p className="text-sm">{voicemail.summary}</p>
          </div>
        )}

        {voicemail.transcript && (
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{transcriptLabel}</p>
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">{voicemail.transcript}</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
