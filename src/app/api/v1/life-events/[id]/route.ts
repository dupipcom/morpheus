import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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
    const user = await prisma.user.findUnique({
      where: { userId }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Update life event
    const lifeEvent = await prisma.lifeEvent.update({
      where: { 
        id: params.id,
        userId: user.id // Ensure user owns this life event
      },
      data: {
        name,
        notes,
        impact
      }
    })

    return NextResponse.json({ lifeEvent })
  } catch (error) {
    console.error('Error updating life event:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = await auth()
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { userId }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Delete life event
    await prisma.lifeEvent.delete({
      where: { 
        id: params.id,
        userId: user.id // Ensure user owns this life event
      }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting life event:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
