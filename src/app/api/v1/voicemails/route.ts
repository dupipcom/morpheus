/**
 * GET /api/v1/voicemails — the caller's own voicemail inbox (phase 12).
 * Clerk-authenticated; newest first, with the unread count.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'
import { listVoicemails } from '@/lib/services/voicemail'
import { ensureVoicemailAudio } from '@/lib/services/voicemail/recordingHandler'

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

    // Lazy recording attach: viewing the inbox kicks a throttled pull of any
    // recording that is still missing (assistant connections have no event
    // webhook). Fire-and-forget — never delays the list response.
    void prisma.voicemail
      .findMany({
        where: {
          targetUserId: user.id,
          audioKey: null,
          createdAt: { gte: new Date(Date.now() - 24 * 3600 * 1000) }
        },
        select: { id: true },
        take: 10
      })
      .then((rows) => {
        rows.forEach((row) => {
          void ensureVoicemailAudio(row.id).catch(() => {})
        })
      })
      .catch(() => {})

    return NextResponse.json(result)
  } catch (error) {
    console.error('Error in GET /api/v1/voicemails:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
