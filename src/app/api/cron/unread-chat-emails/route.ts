import { NextRequest, NextResponse } from 'next/server'
import { isAuthorizedCronRequest, processUnreadChatEmailNotifications } from '@/lib/chat/unreadChatEmailNotifications'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0
// Conservative upper bound for hourly fan-out work across many recipients.
export const maxDuration = 300

export async function GET(request: NextRequest) {
  try {
    if (!isAuthorizedCronRequest(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    return NextResponse.json(await processUnreadChatEmailNotifications())
  } catch (error) {
    console.error('Error sending unread chat emails:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
