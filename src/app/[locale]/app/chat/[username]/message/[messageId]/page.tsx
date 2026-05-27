'use client'

import { use } from 'react'
import { ChatView } from '@/views/chatView'

interface ChatDmMessagePageProps {
  params: Promise<{ username: string; messageId: string }>
}

export default function ChatDmMessagePage({ params }: ChatDmMessagePageProps) {
  const { username, messageId } = use(params)
  return <ChatView initialUsername={username} initialMessageId={messageId} />
}
