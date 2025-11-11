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
    const year = searchParams.get('year')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    // Build where clause
    const where: any = {
      userId: user.id
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
      const ticker = day.ticker || {}
      const analysis = day.analysis as any || {}
      
      // Calculate mood average from mood dimensions
      const moodKeys = ['gratitude', 'optimism', 'restedness', 'tolerance', 'selfEsteem', 'trust'] as const
      const moodValues = moodKeys.map((k) => Number(mood[k]) || 0)
      const moodAverage = moodValues.reduce((sum, val) => sum + val, 0) / moodKeys.length
      
      // Extract earnings from ticker or analysis
      const earnings = ticker.profit || analysis.earnings || 0
      
      // Extract progress from analysis
      const progress = analysis.progress || 0
      
      // Extract availableBalance from analysis or ticker
      const availableBalance = analysis.availableBalance || ticker.prize || 0

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
          trust: mood.trust || 0,
          text: mood.text || []
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

