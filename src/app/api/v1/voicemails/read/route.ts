/**
 * POST /api/v1/voicemails/read — mark the caller's whole voicemail inbox read
 * (phase 12). Called by the chat room when the voicemails panel is opened.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'
import { markAllVoicemailsRead } from '@/lib/services/voicemail'

export async function POST(request: NextRequest) {
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

    const marked = await markAllVoicemailsRead(user.id)
    return NextResponse.json({ ok: true, marked })
  } catch (error) {
    console.error('Error in POST /api/v1/voicemails/read:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
