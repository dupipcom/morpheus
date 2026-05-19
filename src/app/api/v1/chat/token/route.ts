import { NextRequest, NextResponse } from 'next/server'
import { ensureChannelAccess, ensureDmParticipant, getCurrentChatUser } from '@/lib/chat/auth'
import { createAblyTokenRequest } from '@/lib/chat/realtime/ablyServer'
import {
  getChatDmChannelName,
  getChatOrgChannelName,
  getChatOrgMetaChannelName,
  getChatUserChannelName,
} from '@/lib/chat/realtime/channelNames'
import { chatErrorResponse, jsonError } from '@/lib/chat/api'

const TOKEN_ERROR_STATUS: Record<string, number> = {
  'Ably is not configured': 503,
  Forbidden: 403,
  'Channel not found': 404,
  'Conversation not found': 404,
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentChatUser()
    if (!user) return jsonError('Unauthorized', 401)

    const body = await request.json().catch(() => ({}))
    const capability: Record<string, string[]> = {
      [getChatUserChannelName(user.id)]: ['subscribe'],
    }

    if (body?.channelId) {
      const channel = await ensureChannelAccess(String(body.channelId), user.id)
      capability[getChatOrgChannelName(channel.clerkOrgId, channel.id)] = ['subscribe']
      capability[getChatOrgMetaChannelName(channel.clerkOrgId)] = ['subscribe']
    }

    if (body?.dmConversationId) {
      const conversation = await ensureDmParticipant(String(body.dmConversationId), user.id)
      capability[getChatDmChannelName(conversation.id)] = ['subscribe']
    }

    if (body?.orgId) {
      capability[getChatOrgMetaChannelName(String(body.orgId))] = ['subscribe']
    }

    const tokenRequest = await createAblyTokenRequest(user.id, capability)
    return NextResponse.json(tokenRequest)
  } catch (error) {
    console.error('Error creating Ably token request:', error)
    return chatErrorResponse(error, TOKEN_ERROR_STATUS)
  }
}
