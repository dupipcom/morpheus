/**
 * GET /api/v1/voicemails — the caller's own voicemail inbox (phase 12).
 * Clerk-authenticated; newest first, with the unread count.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'
import { listVoicemails } from '@/lib/services/voicemail'

export async function GET(request: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth()
    if (!clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { userId: clerkUserId },
      select: { id: true }
    })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const result = await listVoicemails(user.id)
    return NextResponse.json(result)
  } catch (error) {
    console.error('Error in GET /api/v1/voicemails:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
