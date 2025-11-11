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
      include: { things: true }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    return NextResponse.json({ things: user.things })
  } catch (error) {
    console.error('Error fetching things:', error)
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
    const { name, notes, interactionQuality } = body

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

    // Create thing
    const thing = await prisma.thing.create({
      data: {
        name,
        notes,
        interactionQuality,
        userId: user.id
      }
    })

    return NextResponse.json({ thing })
  } catch (error) {
    console.error('Error creating thing:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
