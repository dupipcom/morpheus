import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({ where: { userId } })

    const whereClause = user
      ? {
          OR: [
            { users: { some: { userId: user.id, role: 'OWNER' } } },
            { visibility: 'PUBLIC' },
          ],
        }
      : { visibility: 'PUBLIC' as const }

    const templates = await prisma.template.findMany({
      where: whereClause,
      orderBy: { createdAt: 'asc' },
    })

    return NextResponse.json({ templates })
  } catch (error) {
    console.error('Error fetching templates:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({ where: { userId } })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const body = await request.json()
    const { name, tasks, visibility } = body

    const template = await prisma.template.create({
      data: {
        name: name || null,
        visibility: (visibility as any) || 'PRIVATE',
        users: [{ userId: user.id, role: 'OWNER' }],
        tasks: Array.isArray(tasks) ? tasks : [],
      },
    })

    return NextResponse.json({ template })
  } catch (error) {
    console.error('Error creating template:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}


