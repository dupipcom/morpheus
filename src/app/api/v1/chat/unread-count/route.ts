import { NextResponse } from 'next/server'
import { getCurrentChatUser } from '@/lib/chat/auth'
import { jsonError } from '@/lib/chat/api'
import { getUnreadCount } from '@/lib/chat/queries'

export async function GET() {
  try {
    const user = await getCurrentChatUser()
    if (!user) return jsonError('Unauthorized', 401)

    return NextResponse.json({ currentUserId: user.id, unreadCount: await getUnreadCount(user.id) })
  } catch (error) {
    console.error('Error getting unread count:', error)
    return jsonError('Internal server error', 500)
  }
}
