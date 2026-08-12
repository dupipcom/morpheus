'use client'

import { use } from 'react'
import { ChatView } from '@/views/chat/chatView'

interface Props {
  params: Promise<{ orgId: string; channelId: string; messageId: string }>
}

export default function ChatChannelMessagePage({ params }: Props) {
  const { orgId, channelId, messageId } = use(params)
  return <ChatView initialOrgId={orgId} initialChannelId={channelId} initialMessageId={messageId} />
}
