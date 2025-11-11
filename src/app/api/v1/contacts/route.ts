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
      include: { contacts: true }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    return NextResponse.json({ contacts: user.contacts })
  } catch (error) {
    console.error('Error fetching contacts:', error)
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
    const { name, email, phone, notes, interactionQuality } = body

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

    // Create contact
    const contact = await prisma.contact.create({
      data: {
        name,
        email,
        phone,
        notes,
        interactionQuality,
        userId: user.id
      }
    })

    return NextResponse.json({ contact })
  } catch (error) {
    console.error('Error creating contact:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
} 