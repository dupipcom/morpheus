import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getAuthenticatedUser } from '@/lib/services/auth'
import { transformDayForAnalytics } from '@/lib/services/day'
import type { DayRecord } from '@/lib/services/day'

const dayListSelect = {
  id: true,
  date: true,
  week: true,
  month: true,
  quarter: true,
  semester: true,
  mood: true,
  ticker: true,
  analysis: true,
  average: true,
  progress: true,
  balance: true,
  stash: true,
  withdrawn: true,
  createdAt: true,
  updatedAt: true,
  visibility: true
}

function getAllowedDayVisibilities(scope: string): Array<'PUBLIC' | 'FRIENDS' | 'CLOSE_FRIENDS'> | null {
  switch (scope) {
    case 'PRIVATE':
    case 'AI_ENABLED':
      return null
    case 'PUBLIC':
      return ['PUBLIC']
    case 'CLOSE_FRIENDS':
      return ['PUBLIC', 'CLOSE_FRIENDS']
    case 'FRIENDS':
      return ['PUBLIC', 'FRIENDS', 'CLOSE_FRIENDS']
    default:
      return null
  }
}

export async function GET(req: NextRequest) {
  try {
    const authResult = await getAuthenticatedUser()
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }

    const currentUserId = authResult.user!.id
    const { searchParams } = new URL(req.url)
    const requestedUserId = searchParams.get('userId')
    const year = searchParams.get('year')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const targetUserId = requestedUserId || currentUserId

    let delegationScope: string | null = null

    if (targetUserId !== currentUserId) {
      const delegation = await prisma.delegation.findUnique({
        where: {
          delegatorId_delegatedId: {
            delegatorId: targetUserId,
            delegatedId: currentUserId
          }
        },
        select: {
          scope: true
        }
      })

      if (!delegation) {
        return NextResponse.json({ error: 'Not authorized for selected user data' }, { status: 403 })
      }

      delegationScope = delegation.scope
    }

    const where: Record<string, unknown> = { userId: targetUserId }

    if (year) {
      if (!/^\d{4}$/.test(year)) {
        return NextResponse.json({ error: 'Invalid year format' }, { status: 400 })
      }
      where.date = { gte: `${year}-01-01`, lte: `${year}-12-31` }
    } else if (startDate && endDate) {
      where.date = { gte: startDate, lte: endDate }
    }

    const allowedVisibility = delegationScope ? getAllowedDayVisibilities(delegationScope) : null
    if (allowedVisibility) {
      where.visibility = { in: allowedVisibility }
    }

    const days = await prisma.day.findMany({
      where,
      select: dayListSelect,
      orderBy: { date: 'asc' }
    })

    const transformedDays = days.map((day) =>
      transformDayForAnalytics(day as unknown as DayRecord)
    )

    return NextResponse.json({
      userId: targetUserId,
      delegationScope,
      days: transformedDays
    })
  } catch (error) {
    console.error('Error fetching dashboard data:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
