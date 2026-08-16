import { NextRequest, NextResponse } from 'next/server'

import { getCurrentChatUser } from '@/lib/chat/auth'
import { chatErrorResponse, jsonError } from '@/lib/chat/api'
import { markSmsConversationRead } from '@/lib/services/sms'

const SMS_READ_ERROR_STATUS: Record<string, number> = {
  'SMS conversation not found': 404,
  'Not your SMS conversation': 403
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    const user = await getCurrentChatUser()
    if (!user) return jsonError('Unauthorized', 401)

    const { conversationId } = await params
    const body = await request.json().catch(() => ({}))

    await markSmsConversationRead({
      userId: user.id,
      conversationId,
      lastReadMessageId: body?.lastReadMessageId ?? null
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error marking SMS conversation read:', error)
    return chatErrorResponse(error, SMS_READ_ERROR_STATUS)
  }
}
