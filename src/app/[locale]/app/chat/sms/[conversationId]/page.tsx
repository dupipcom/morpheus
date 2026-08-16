'use client'

import { use } from 'react'
import { ChatView } from '@/views/chat/chatView'

interface ChatSmsPageProps {
  params: Promise<{ conversationId: string }>
}

export default function ChatSmsPage({ params }: ChatSmsPageProps) {
  const { conversationId } = use(params)
  return <ChatView initialSmsConversationId={conversationId} />
}
