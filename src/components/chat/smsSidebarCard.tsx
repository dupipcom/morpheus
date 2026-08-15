'use client'

import { MessageSquare } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChatUnreadBadge } from '@/components/chat/chatUnreadBadge'
import { useI18n } from '@/lib/contexts/i18n'
import type { SmsConversationSummary } from '@/lib/services/sms'

interface SmsSidebarCardProps {
  conversations: SmsConversationSummary[]
  isLoading: boolean
  hasError: boolean
  hasAssignedNumber: boolean
  onSelectConversation: (conversation: SmsConversationSummary) => void
}

/**
 * Premium SMS conversation list for the chat sidebar. Data is fetched by
 * ChatView (not here) so Ably invalidations refresh unread badges instantly.
 */
export function SmsSidebarCard({
  conversations,
  isLoading,
  hasError,
  hasAssignedNumber,
  onSelectConversation,
}: SmsSidebarCardProps) {
  const { t } = useI18n()

  return (
    <Card>
      <CardHeader className="space-y-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageSquare className="h-4 w-4" />
          {t('chat.sms.label')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? (
          <p className="text-xs text-muted-foreground">{t('chat.sms.loading')}</p>
        ) : hasError ? (
          <p className="text-xs text-destructive">{t('chat.sms.error')}</p>
        ) : !hasAssignedNumber ? (
          <p className="text-xs text-muted-foreground">{t('chat.sms.noNumberHint')}</p>
        ) : conversations.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t('chat.sms.empty')}</p>
        ) : (
          <div className="space-y-2">
            {conversations.map((conversation) => (
              <button
                key={conversation.id}
                type="button"
                className="flex w-full items-center justify-between rounded-lg border border-transparent px-3 py-2 text-left text-sm hover:border-border hover:bg-muted/40"
                onClick={() => onSelectConversation(conversation)}
              >
                <span>{conversation.counterpartPhoneNumber}</span>
                <ChatUnreadBadge count={conversation.unreadCount} />
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
