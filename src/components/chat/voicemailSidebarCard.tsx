'use client'

import { Voicemail as VoicemailIcon } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChatUnreadBadge } from '@/components/chat/chatUnreadBadge'
import { useI18n } from '@/lib/contexts/i18n'
import type { VoicemailListItem } from '@/lib/services/voicemail'

interface VoicemailSidebarCardProps {
  voicemails: VoicemailListItem[]
  isLoading: boolean
  hasError: boolean
  onSelectVoicemail: (voicemail: VoicemailListItem) => void
}

/**
 * Voicemail inbox card for the chat sidebar (phase 12). Data is fetched by
 * ChatView (not here) so Ably invalidations refresh the list instantly.
 */
export function VoicemailSidebarCard({
  voicemails,
  isLoading,
  hasError,
  onSelectVoicemail,
}: VoicemailSidebarCardProps) {
  const { t, hasTranslation } = useI18n()

  const label = hasTranslation('chat.voicemail.label') ? t('chat.voicemail.label') : 'Voicemails'
  const loadingLabel = hasTranslation('chat.voicemail.loading') ? t('chat.voicemail.loading') : 'Loading voicemails…'
  const errorLabel = hasTranslation('chat.voicemail.error') ? t('chat.voicemail.error') : 'Could not load your voicemails'
  const emptyLabel = hasTranslation('chat.voicemail.empty') ? t('chat.voicemail.empty') : 'No voicemails yet'
  const unknownCallerLabel = hasTranslation('chat.voicemail.unknownCaller') ? t('chat.voicemail.unknownCaller') : 'Unknown caller'

  return (
    <Card>
      <CardHeader className="space-y-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <VoicemailIcon className="h-4 w-4" />
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? (
          <p className="text-xs text-muted-foreground">{loadingLabel}</p>
        ) : hasError ? (
          <p className="text-xs text-destructive">{errorLabel}</p>
        ) : voicemails.length === 0 ? (
          <p className="text-xs text-muted-foreground">{emptyLabel}</p>
        ) : (
          <div className="space-y-2">
            {voicemails.map((voicemail) => (
              <button
                key={voicemail.id}
                type="button"
                className="flex w-full items-center justify-between rounded-lg border border-transparent px-3 py-2 text-left text-sm hover:border-border hover:bg-muted/40"
                onClick={() => onSelectVoicemail(voicemail)}
              >
                <span className="min-w-0 truncate">
                  {voicemail.callerName || voicemail.callerPhone || unknownCallerLabel}
                </span>
                <ChatUnreadBadge count={voicemail.readAt ? 0 : 1} />
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
