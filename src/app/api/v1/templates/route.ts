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
            { owners: { has: user.id } },
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


