'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ChatUnreadBadge } from '@/components/chat/chatUnreadBadge'
import { getAblyRealtimeClient } from '@/lib/chat/realtime/ablyClient'
import { CHAT_POLL_INTERVAL_MS } from '@/lib/chat/constants'
import { getChatUserChannelName } from '@/lib/chat/realtime/channelNames'

const fetcher = async (url: string) => {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error('Failed to load chat unread count')
  }

  return response.json()
}

interface ChatNavButtonProps {
  isActive: boolean
  onClick: () => void
  className?: string
  size?: 'default' | 'sm' | 'lg' | 'icon'
}

export function ChatNavButton({ isActive, onClick, className, size = 'icon' }: ChatNavButtonProps) {
  const { data, mutate } = useSWR('/api/v1/chat/unread-count', fetcher, {
    refreshInterval: CHAT_POLL_INTERVAL_MS,
  })

  useEffect(() => {
    const currentUserId = data?.currentUserId
    if (!currentUserId) return

    const client = getAblyRealtimeClient()
    if (!client) return

    const channel = client.channels.get(getChatUserChannelName(currentUserId))
    const handler = () => {
      void mutate()
    }

    void channel.subscribe(handler)

    return () => {
      void channel.unsubscribe(handler)
    }
  }, [data?.currentUserId, mutate])

  return (
    <Button
      asChild
      variant={isActive ? 'default' : 'outline'}
      size={size}
      className={`relative ${
        isActive ? 'bg-muted text-foreground dark:bg-foreground dark:text-background' : ''
      } ${className || ''}`}
      aria-label="Chat"
    >
      <Link href="/app/chat" onClick={onClick}>
        <Mail className="w-4 h-4" />
        <ChatUnreadBadge count={data?.unreadCount ?? 0} className="absolute -right-2 -top-2 min-w-5 justify-center px-1.5 py-0.5 text-[10px]" />
      </Link>
    </Button>
  )
}
