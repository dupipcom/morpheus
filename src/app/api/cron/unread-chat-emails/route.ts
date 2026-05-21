import { NextRequest, NextResponse } from 'next/server'
import { isAuthorizedCronRequest, processUnreadChatEmailNotifications } from '@/lib/chat/unreadChatEmailNotifications'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0
// Conservative upper bound for the initial hourly fan-out implementation; if recipient volume grows,
// this flow should be split into smaller batches before increasing complexity here.
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
