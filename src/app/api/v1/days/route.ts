import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'
import { getWeekNumber } from '@/app/helpers'

export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth()
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { userId },
      select: { id: true }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Get query parameters
    const { searchParams } = new URL(req.url)
    const date = searchParams.get('date')
    const year = searchParams.get('year')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    // Build where clause
    const where: any = {
      userId: user.id
    }

    // If a specific date is requested, return just that day
    if (date) {
      const day = await prisma.day.findFirst({
        where: {
          userId: user.id,
          date: date
        },
        select: {
          id: true,
          date: true,
          mood: true,
          personIds: true,
          thingIds: true,
          eventIds: true,
          analysis: true,
          ticker: true
        }
      })

      if (!day) {
        return NextResponse.json({ day: null })
      }

      // Fetch related persons, things, and events
      const [persons, things, events] = await Promise.all([
        day.personIds.length > 0 ? prisma.person.findMany({
          where: { id: { in: day.personIds } },
          select: { id: true, name: true }
        }) : [],
        day.thingIds.length > 0 ? prisma.thing.findMany({
          where: { id: { in: day.thingIds } },
          select: { id: true, name: true }
        }) : [],
        day.eventIds.length > 0 ? prisma.event.findMany({
          where: { id: { in: day.eventIds } },
          select: { id: true, name: true }
        }) : []
      ])

      // Get quality values from analysis
      const analysis = day.analysis as any || {}
      const personQualities = analysis.personQualities || {}
      const thingQualities = analysis.thingQualities || {}
      const eventQualities = analysis.eventQualities || {}

      // Merge persons, things, and events with their quality values
      const contactsWithQuality = persons.map((person: any) => ({
        ...person,
        quality: personQualities[person.id] || 0
      }))

      const thingsWithQuality = things.map((thing: any) => ({
        ...thing,
        quality: thingQualities[thing.id] || 0
      }))

      const eventsWithQuality = events.map((event: any) => ({
        ...event,
        quality: eventQualities[event.id] || 0
      }))

      // Transform the day to include mood and related data
      const mood = day.mood || {}
      return NextResponse.json({
        day: {
          id: day.id,
          date: day.date,
          mood: {
            gratitude: mood.gratitude || 0,
            optimism: mood.optimism || 0,
            restedness: mood.restedness || 0,
            tolerance: mood.tolerance || 0,
            selfEsteem: mood.selfEsteem || 0,
            trust: mood.trust || 0
          },
          contacts: contactsWithQuality,
          things: thingsWithQuality,
          lifeEvents: eventsWithQuality,
          ticker: (day as any).ticker || []
        }
      })
    }

    if (year) {
      // Filter by year if provided
      const yearNum = parseInt(year)
      where.date = {
        startsWith: yearNum.toString()
      }
    } else if (startDate && endDate) {
      where.date = {
        gte: startDate,
        lte: endDate
      }
    }

    // Fetch days from Day model
    const days = await prisma.day.findMany({
      where,
      select: {
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
        createdAt: true,
        updatedAt: true
      },
      orderBy: {
        date: 'asc'
      }
    })

    // Transform days to match the expected format for analytics
    const transformedDays = days.map((day) => {
      const dayDate = day.date ? new Date(day.date) : new Date(day.createdAt)
      const [_, weekNumber] = getWeekNumber(dayDate)
      
      // Extract values from mood
      const mood = day.mood || {}
      const ticker = day.ticker || []
      const analysis = day.analysis as any || {}
      
      // Use day.average for moodAverage (calculated on backend)
      const moodAverage = typeof day.average === 'number' ? day.average : (() => {
        // Fallback: calculate from mood dimensions if average not set
      const moodKeys = ['gratitude', 'optimism', 'restedness', 'tolerance', 'selfEsteem', 'trust'] as const
      const moodValues = moodKeys.map((k) => Number(mood[k]) || 0)
        return moodValues.reduce((sum, val) => sum + val, 0) / moodKeys.length
      })()
      
      // Calculate earnings from ticker array (sum of profit values)
      const earnings = Array.isArray(ticker) 
        ? ticker.reduce((sum: number, t: any) => sum + (Number(t.profit) || 0), 0)
        : (typeof ticker === 'object' && ticker !== null ? (Number((ticker as any).profit) || 0) : 0)
      
      // Use day.progress (calculated on backend from productivity)
      const progress = typeof day.progress === 'number' ? day.progress : 0
      
      // Use day.balance for availableBalance (stored when day is created/updated)
      const availableBalance = typeof day.balance === 'number' ? day.balance : 0

      return {
        id: day.id,
        date: day.date || dayDate.toISOString().split('T')[0],
        year: dayDate.getFullYear(),
        week: day.week || weekNumber,
        month: day.month || dayDate.getMonth() + 1,
        quarter: day.quarter,
        semester: day.semester,
        mood: {
          gratitude: mood.gratitude || 0,
          optimism: mood.optimism || 0,
          restedness: mood.restedness || 0,
          tolerance: mood.tolerance || 0,
          selfEsteem: mood.selfEsteem || 0,
          trust: mood.trust || 0
        },
        moodAverage: moodAverage,
        earnings: Number(earnings) || 0,
        progress: Number(progress) || 0,
        availableBalance: Number(availableBalance) || 0,
        ticker: ticker,
        analysis: analysis
      }
    })

    return NextResponse.json({ days: transformedDays })
  } catch (error) {
    console.error('Error fetching days:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth()
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { userId },
      select: { id: true, availableBalance: true, stash: true, equity: true }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const body = await req.json()
    const { date, mood, contacts, things, lifeEvents } = body

    if (!date) {
      return NextResponse.json({ error: 'Date is required' }, { status: 400 })
    }

    // Extract IDs and quality values from contacts, things, and lifeEvents arrays
    // They might be objects with {id, quality} or just IDs
    const personIds = contacts ? contacts.map((c: any) => typeof c === 'string' ? c : c.id).filter(Boolean) : []
    const thingIds = things ? things.map((t: any) => typeof t === 'string' ? t : t.id).filter(Boolean) : []
    const eventIds = lifeEvents ? lifeEvents.map((e: any) => typeof e === 'string' ? e : e.id).filter(Boolean) : []
    
    // Store quality values in analysis JSON field
    // Create mappings: personId -> quality, thingId -> quality, eventId -> quality
    const personQualities: Record<string, number> = {}
    const thingQualities: Record<string, number> = {}
    const eventQualities: Record<string, number> = {}
    
    if (contacts) {
      contacts.forEach((c: any) => {
        if (typeof c === 'object' && c.id && c.quality !== undefined) {
          personQualities[c.id] = Number(c.quality) || 0
        }
      })
    }
    
    if (things) {
      things.forEach((t: any) => {
        if (typeof t === 'object' && t.id && t.quality !== undefined) {
          thingQualities[t.id] = Number(t.quality) || 0
        }
      })
    }
    
    if (lifeEvents) {
      lifeEvents.forEach((e: any) => {
        if (typeof e === 'object' && e.id && e.quality !== undefined) {
          eventQualities[e.id] = Number(e.quality) || 0
        }
      })
    }
    
    // Build analysis object with quality mappings
    const analysisData: any = {
      personQualities,
      thingQualities,
      eventQualities
    }

    // Construct mood object with only provided fields (partial updates)
    // Only include fields that are explicitly provided (not undefined)
    let moodUpdates: any = undefined
    if (mood !== undefined && mood !== null) {
      moodUpdates = {}
      const moodKeys = ['gratitude', 'optimism', 'restedness', 'tolerance', 'selfEsteem', 'trust'] as const
      moodKeys.forEach((key) => {
        if (mood[key] !== undefined) {
          moodUpdates[key] = Number(mood[key]) || 0
        }
      })
      // Only set moodUpdates if at least one field was provided
      if (Object.keys(moodUpdates).length === 0) {
        moodUpdates = undefined
      }
    }

    // Calculate week, month, quarter, semester from date
    const dateObj = new Date(date)
    const [_, weekNumber] = getWeekNumber(dateObj)
    const month = dateObj.getMonth() + 1
    const quarter = Math.ceil(month / 3)
    const semester = month <= 6 ? 1 : 2

    // Use findFirst to ensure only one day per user per date
    // First, try to find existing day
    const existingDay = await prisma.day.findFirst({
      where: {
        userId: user.id,
        date: date
      },
      select: {
        id: true,
        mood: true,
        analysis: true
      }
    })

    let day
    if (existingDay) {
      // Update existing day - merge with existing data
      const updateData: any = {
        week: weekNumber,
        month: month,
        quarter: quarter,
        semester: semester
      }

      if (moodUpdates !== undefined) {
        // Merge only provided mood fields with existing mood data
        const existingMood = existingDay.mood as any || {}
        // Ensure all required Mood type fields are present
        const mergedMood = {
          gratitude: moodUpdates.gratitude !== undefined ? Number(moodUpdates.gratitude) || 0 : (Number(existingMood.gratitude) || 0),
          optimism: moodUpdates.optimism !== undefined ? Number(moodUpdates.optimism) || 0 : (Number(existingMood.optimism) || 0),
          restedness: moodUpdates.restedness !== undefined ? Number(moodUpdates.restedness) || 0 : (Number(existingMood.restedness) || 0),
          tolerance: moodUpdates.tolerance !== undefined ? Number(moodUpdates.tolerance) || 0 : (Number(existingMood.tolerance) || 0),
          selfEsteem: moodUpdates.selfEsteem !== undefined ? Number(moodUpdates.selfEsteem) || 0 : (Number(existingMood.selfEsteem) || 0),
          trust: moodUpdates.trust !== undefined ? Number(moodUpdates.trust) || 0 : (Number(existingMood.trust) || 0)
        }
        updateData.mood = mergedMood
        
        // Calculate mood average from all available mood dimensions (both existing and updated)
        const moodKeys = ['gratitude', 'optimism', 'restedness', 'tolerance', 'selfEsteem', 'trust'] as const
        const moodValues = moodKeys.map((k) => Number(mergedMood[k]) || 0)
        const sum = moodValues.reduce((acc, val) => acc + val, 0)
        updateData.average = sum / moodKeys.length
      }
      if (personIds !== undefined) {
        updateData.personIds = personIds
      }
      if (thingIds !== undefined) {
        updateData.thingIds = thingIds
      }
      if (eventIds !== undefined) {
        updateData.eventIds = eventIds
      }
      // Merge analysis data with existing analysis
      const existingAnalysis = existingDay.analysis as any || {}
      updateData.analysis = {
        ...existingAnalysis,
        ...analysisData
      }

      day = await prisma.day.update({
        where: { id: existingDay.id },
        data: updateData
      })
    } else {
      // Create new day - store user's availableBalance, stash, and equity when first created
      const userBalance = typeof user.availableBalance === 'number' 
        ? user.availableBalance 
        : (typeof user.availableBalance === 'string' ? parseFloat(user.availableBalance || '0') : 0)
      const userStash = typeof user.stash === 'number' 
        ? user.stash 
        : (typeof user.stash === 'string' ? parseFloat(user.stash || '0') : 0)
      const userEquity = typeof user.equity === 'number' 
        ? user.equity 
        : (typeof user.equity === 'string' ? parseFloat(user.equity || '0') : 0)
      
      // For new days, ensure all mood fields are present (default to 0 if not provided)
      const initialMood = moodUpdates ? {
        gratitude: Number(moodUpdates.gratitude) || 0,
        optimism: Number(moodUpdates.optimism) || 0,
        restedness: Number(moodUpdates.restedness) || 0,
        tolerance: Number(moodUpdates.tolerance) || 0,
        selfEsteem: Number(moodUpdates.selfEsteem) || 0,
        trust: Number(moodUpdates.trust) || 0
      } : {
        gratitude: 0,
        optimism: 0,
        restedness: 0,
        tolerance: 0,
        selfEsteem: 0,
        trust: 0
      }
      
      // Calculate average for new day
      const moodKeys = ['gratitude', 'optimism', 'restedness', 'tolerance', 'selfEsteem', 'trust'] as const
      const moodValues = moodKeys.map((k) => Number(initialMood[k]) || 0)
      const sum = moodValues.reduce((acc, val) => acc + val, 0)
      const initialAverage = sum / moodKeys.length
      
      day = await prisma.day.create({
        data: {
          userId: user.id,
          date: date,
          mood: initialMood,
          personIds: personIds,
          thingIds: thingIds,
          eventIds: eventIds,
          analysis: analysisData,
          average: initialAverage,
          balance: userBalance,
          stash: userStash,
          equity: userEquity,
          week: weekNumber,
          month: month,
          quarter: quarter,
          semester: semester
        }
      })
    }

    return NextResponse.json({ day })
  } catch (error) {
    console.error('Error creating/updating day:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

