/**
 * GET /api/v1/voicemails/[id]/audio — authenticated audio stream (phase 12).
 * Owner-only, Range passthrough (206) for seeking, nosniff, private cache —
 * same pattern as attachments/[documentId]/file: the bucket is never public.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'
import { getVoicemailAudioKey } from '@/lib/services/voicemail'
import { ensureVoicemailAudio } from '@/lib/services/voicemail/recordingHandler'
import { getObjectStream } from '@/lib/storage/s3'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params
    let audio = await getVoicemailAudioKey(user.id, id)
    if (!audio) {
      // Lazy recording attach (owner-only): playing a still-processing
      // voicemail triggers one throttled pull of the finalized recording
      // (assistant connections have no event webhook), then retries once.
      const owned = await prisma.voicemail.findFirst({
        where: { id, targetUserId: user.id },
        select: { id: true }
      })
      if (owned) {
        const attempt = await ensureVoicemailAudio(id)
        if (attempt.attached) {
          audio = await getVoicemailAudioKey(user.id, id)
        }
      }
    }
    if (!audio) {
      return NextResponse.json({ error: 'Voicemail audio not found' }, { status: 404 })
    }

    const range = request.headers.get('range')
    const object = await getObjectStream(audio.key, range)
    if (!object) {
      return NextResponse.json({ error: 'Voicemail audio not found' }, { status: 404 })
    }

    const headers = new Headers()
    headers.set('Content-Type', audio.mimeType)
    headers.set('X-Content-Type-Options', 'nosniff')
    headers.set('Cache-Control', 'private, max-age=3600')
    headers.set('Accept-Ranges', 'bytes')
    const status = object.contentRange ? 206 : 200
    if (object.contentRange) {
      headers.set('Content-Range', object.contentRange)
    }

    return new Response(object.stream, { status, headers })
  } catch (error) {
    console.error('Error in GET /api/v1/voicemails/[id]/audio:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
