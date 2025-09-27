import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'

export async function GET() {
  try {
    const { userId } = await auth()
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user from database
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

    const body = await request.json()
    const { name, notes, impact } = body

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    // Get user from database
    let user = await prisma.user.findUnique({
      where: { userId }
    })

    if (!user) {
      // Create user if doesn't exist
      user = await prisma.user.create({
        data: { userId }
      })
    }

    // Create life event
    const lifeEvent = await prisma.lifeEvent.create({
      data: {
        name,
        notes,
        impact,
        userId: user.id
      }
    })

    return NextResponse.json({ lifeEvent })
  } catch (error) {
    console.error('Error creating life event:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
