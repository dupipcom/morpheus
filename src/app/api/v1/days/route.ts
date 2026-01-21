import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getAuthenticatedUser } from '@/lib/services/auth'
import {
  transformDayForAnalytics,
  transformSingleDayResponse,
  calculateDatePeriods,
  extractQualityMappings,
  extractEntityIds,
  buildAnalysisData,
  parseMoodUpdates,
  mergeMoodUpdates,
  calculateMoodAverage,
  createDefaultMood,
  parseNumericValue
} from '@/lib/services/day'
import type { DayRecord, DayWithRelations } from '@/lib/services/day'

/**
 * Select configuration for single day queries
 */
const singleDaySelect = {
  id: true,
  date: true,
  mood: true,
  personIds: true,
  thingIds: true,
  eventIds: true,
  analysis: true,
  ticker: true
}

/**
 * Select configuration for day list queries
 */
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
  updatedAt: true
}

export async function GET(req: NextRequest) {
  try {
    const authResult = await getAuthenticatedUser()
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }
    const { user } = authResult

    const { searchParams } = new URL(req.url)
    const date = searchParams.get('date')
    const year = searchParams.get('year')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    // Single day query
    if (date) {
      const day = await prisma.day.findFirst({
        where: { userId: user!.id, date },
        select: singleDaySelect
      })

      if (!day) {
        return NextResponse.json({ day: null })
      }

      const response = await transformSingleDayResponse(day as DayWithRelations)
      return NextResponse.json({ day: response })
    }

    // Build where clause for list query
    const where: Record<string, unknown> = { userId: user!.id }

    if (year) {
      where.date = { startsWith: parseInt(year).toString() }
    } else if (startDate && endDate) {
      where.date = { gte: startDate, lte: endDate }
    }

    const days = await prisma.day.findMany({
      where,
      select: dayListSelect,
      orderBy: { date: 'asc' }
    })

    const transformedDays = days.map((day) =>
      transformDayForAnalytics(day as unknown as DayRecord)
    )

    return NextResponse.json({ days: transformedDays })
  } catch (error) {
    console.error('Error fetching days:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const authResult = await getAuthenticatedUser()
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }
    const { user } = authResult

    // Fetch user balance data
    const userData = await prisma.user.findUnique({
      where: { id: user!.id },
      select: { availableBalance: true, stash: true, equity: true }
    })

    const body = await req.json()
    const { date, mood, contacts, things, lifeEvents } = body

    if (!date) {
      return NextResponse.json({ error: 'Date is required' }, { status: 400 })
    }

    // Extract IDs and quality mappings
    const personIds = extractEntityIds(contacts)
    const thingIds = extractEntityIds(things)
    const eventIds = extractEntityIds(lifeEvents)

    const qualityMapping = extractQualityMappings(contacts, things, lifeEvents)
    const analysisData = buildAnalysisData(qualityMapping)
    const moodUpdates = parseMoodUpdates(mood)
    const datePeriods = calculateDatePeriods(date)

    // Find existing day
    const existingDay = await prisma.day.findFirst({
      where: { userId: user!.id, date },
      select: { id: true, mood: true, analysis: true }
    })

    let day
    if (existingDay) {
      const updateData: Record<string, unknown> = {
        week: datePeriods.week,
        month: datePeriods.month,
        quarter: datePeriods.quarter,
        semester: datePeriods.semester
      }

      if (moodUpdates !== undefined) {
        const mergedMood = mergeMoodUpdates(existingDay.mood as Record<string, number>, moodUpdates)
        updateData.mood = mergedMood
        updateData.average = calculateMoodAverage(mergedMood)
      }

      if (personIds !== undefined) updateData.personIds = personIds
      if (thingIds !== undefined) updateData.thingIds = thingIds
      if (eventIds !== undefined) updateData.eventIds = eventIds

      if (Object.keys(analysisData).length > 0) {
        const existingAnalysis = (existingDay.analysis || {}) as Record<string, unknown>
        updateData.analysis = { ...existingAnalysis, ...analysisData }
      }

      day = await prisma.day.update({
        where: { id: existingDay.id },
        data: updateData
      })
    } else {
      // Create new day
      const userBalance = parseNumericValue(userData?.availableBalance)
      const userStash = parseNumericValue(userData?.stash)
      const userEquity = parseNumericValue(userData?.equity)

      const initialMood = moodUpdates
        ? mergeMoodUpdates(null, moodUpdates)
        : createDefaultMood()

      day = await prisma.day.create({
        data: {
          userId: user!.id,
          date,
          mood: initialMood,
          personIds: personIds || [],
          thingIds: thingIds || [],
          eventIds: eventIds || [],
          analysis: analysisData,
          average: calculateMoodAverage(initialMood),
          balance: userBalance,
          stash: userStash,
          equity: userEquity,
          ...datePeriods
        }
      })
    }

    return NextResponse.json({ day })
  } catch (error) {
    console.error('Error creating/updating day:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
