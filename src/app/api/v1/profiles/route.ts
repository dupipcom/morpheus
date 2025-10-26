import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const query = (searchParams.get('query') || '').trim()

    if (!query) {
      return NextResponse.json({ profiles: [] })
    }

    // Search public usernames
    const profiles = await prisma.profile.findMany({
      where: {
        userNameVisible: true,
        userName: {
          contains: query,
          mode: 'insensitive'
        }
      },
      select: {
        userId: true,
        userName: true,
      },
      take: 20
    })

    return NextResponse.json({ profiles })
  } catch (error) {
    console.error('Error searching profiles:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}


