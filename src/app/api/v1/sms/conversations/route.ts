import { NextResponse } from 'next/server'

import { getCurrentChatUser } from '@/lib/chat/auth'
import { jsonError } from '@/lib/chat/api'
import { listSmsConversations } from '@/lib/services/sms'

export async function GET() {
  try {
    const user = await getCurrentChatUser()
    if (!user) return jsonError('Unauthorized', 401)

    const conversations = await listSmsConversations(user.id)
    return NextResponse.json({ conversations })
  } catch (error) {
    console.error('Error listing SMS conversations:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
