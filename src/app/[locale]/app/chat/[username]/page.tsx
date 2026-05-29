'use client'

import { use } from 'react'
import { ChatView } from '@/views/chatView'

interface ChatDmPageProps {
  params: Promise<{ username: string }>
}

export default function ChatDmPage({ params }: ChatDmPageProps) {
  const { username } = use(params)
  return <ChatView initialUsername={username} />
}
