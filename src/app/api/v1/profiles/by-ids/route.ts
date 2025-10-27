import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const idsParam = searchParams.get('ids') || ''
    const ids = idsParam.split(',').map(s => s.trim()).filter(Boolean)

    if (!ids.length) {
      return NextResponse.json({ profiles: [] })
    }

    const profiles = await prisma.profile.findMany({
      where: { userId: { in: ids } },
      select: { userId: true, userName: true },
      take: 100
    })

    return NextResponse.json({ profiles })
  } catch (error) {
    console.error('Error fetching profiles by ids:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}


