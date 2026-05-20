'use client'

import Link from 'next/link'
import { LinkPreview } from '@/components/linkPreview'
import { useI18n } from '@/lib/contexts/i18n'
import { extractUrls } from '@/lib/utils/linkPreview'

interface ChatMessageContentProps {
  content: string
  deletedAt?: string | null
}

export function ChatMessageContent({ content, deletedAt }: ChatMessageContentProps) {
  const { t, hasTranslation } = useI18n()
  const deletedMessageLabel = hasTranslation('chat.deletedMessage') ? t('chat.deletedMessage') : 'Message deleted'

  if (deletedAt) {
    return <p className="text-sm italic text-muted-foreground">{deletedMessageLabel}</p>
  }

  const urls = extractUrls(content)

  return (
    <div className="space-y-2">
      <p className="whitespace-pre-wrap break-words text-sm leading-6">{content}</p>
      {urls.map((url) => (
        <div key={url} className="space-y-2">
          <Link href={url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary underline break-all">
            {url}
          </Link>
          <LinkPreview url={url} />
        </div>
      ))}
    </div>
  )
}
