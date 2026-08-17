import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'
import { sanitizeText } from '@/lib/utils/sanitize'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json().catch(() => null)
    const { name, quality } = (body || {}) as Record<string, unknown>

    if (typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({
      where: { userId }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const lifeEvent = await prisma.lifeEvent.updateMany({
      where: {
        id: id,
        userId: user.id // Ensure user owns this event
      },
      data: {
        name: sanitizeText(name),
        quality: typeof quality === 'number' ? quality : null
      }
    })

    if (lifeEvent.count === 0) {
      return NextResponse.json({ error: 'Life event not found' }, { status: 404 })
    }

    return NextResponse.json({ lifeEvent })
  } catch (error) {
    console.error('Error updating life event:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    const user = await prisma.user.findUnique({
      where: { userId }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    await prisma.lifeEvent.deleteMany({
      where: {
        id: id,
        userId: user.id // Ensure user owns this event
      }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting life event:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
