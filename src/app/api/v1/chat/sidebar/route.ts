import { NextResponse } from 'next/server'
import { getCurrentChatUser } from '@/lib/chat/auth'
import { jsonError } from '@/lib/chat/api'
import { getChatSidebar } from '@/lib/chat/queries'

export const revalidate = 0

export async function GET() {
  try {
    const user = await getCurrentChatUser()
    if (!user) return jsonError('Unauthorized', 401)

    return NextResponse.json(await getChatSidebar(user.id))
  } catch (error) {
    console.error('Error getting chat sidebar:', error)
    return jsonError('Internal server error', 500)
  }
}
