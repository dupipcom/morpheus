'use client'

import { use } from 'react'
import { ChatView } from '@/views/chat/chatView'

interface Props {
  params: Promise<{ orgId: string; channelId: string }>
}

export default function ChatChannelPage({ params }: Props) {
  const { orgId, channelId } = use(params)
  return <ChatView initialOrgId={orgId} initialChannelId={channelId} />
}
