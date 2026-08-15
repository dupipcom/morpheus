import { NextRequest, NextResponse } from 'next/server'

import { getCurrentChatUser } from '@/lib/chat/auth'
import { chatErrorResponse, jsonError } from '@/lib/chat/api'
import { listSmsMessages, sendSmsMessage } from '@/lib/services/sms'

const SMS_MESSAGE_ERROR_STATUS: Record<string, number> = {
  'SMS conversation not found': 404,
  'Not your SMS conversation': 403,
  'Message content is required': 400,
  'Message content must be 1600 characters or fewer': 400,
  'No virtual number assigned': 409,
  'Could not send SMS': 502
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    const user = await getCurrentChatUser()
    if (!user) return jsonError('Unauthorized', 401)

    const { conversationId } = await params
    const limit = Number(request.nextUrl.searchParams.get('limit') || '50')
    const messages = await listSmsMessages(conversationId, user.id, Math.min(Math.max(limit, 1), 100))

    return NextResponse.json({ messages })
  } catch (error) {
    console.error('Error listing SMS messages:', error)
    return chatErrorResponse(error, SMS_MESSAGE_ERROR_STATUS)
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    const user = await getCurrentChatUser()
    if (!user) return jsonError('Unauthorized', 401)

    const { conversationId } = await params
    const body = await request.json()
    const { messageId } = await sendSmsMessage({
      userId: user.id,
      conversationId,
      content: body?.content || ''
    })

    return NextResponse.json({ messageId }, { status: 201 })
  } catch (error) {
    console.error('Error sending SMS message:', error)
    return chatErrorResponse(error, SMS_MESSAGE_ERROR_STATUS)
  }
}
