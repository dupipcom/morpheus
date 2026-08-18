/**
 * Life events API Route Handler (Phase 8)
 *
 * The pre-Phase-8 `Event` model (life events: name + quality) moved here when
 * public events took over `/api/v1/events`. Same handlers, `LifeEvent` model.
 * `GET /api/v1/events/legacy` redirects here for any out-of-tree caller
 * (removed next release).
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'
import { sanitizeText } from '@/lib/utils/sanitize'

export async function GET() {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { userId },
      include: { lifeEvents: true }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    return NextResponse.json({ lifeEvents: user.lifeEvents })
  } catch (error) {
    console.error('Error fetching life events:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    const { name, quality } = (body || {}) as Record<string, unknown>

    if (typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    const sanitizedName = sanitizeText(name)

    let user = await prisma.user.findUnique({
      where: { userId }
    })

    if (!user) {
      user = await prisma.user.create({
        data: { userId }
      })
    }

    const lifeEvent = await prisma.lifeEvent.create({
      data: {
        name: sanitizedName,
        quality: typeof quality === 'number' ? quality : null,
        userId: user.id
      }
    })

    return NextResponse.json({ lifeEvent })
  } catch (error) {
    console.error('Error creating life event:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
