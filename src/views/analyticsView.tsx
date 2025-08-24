'use client'
import { type ChartConfig } from "@/components/ui/chart"
import { useState, useEffect, useContext } from 'react'
import { Area, CartesianGrid, Bar, AreaChart, XAxis } from "recharts"
 
import { ChartContainer, ChartTooltipContent, ChartTooltip, ChartLegendContent, ChartLegend } from "@/components/ui/chart"
import { Button } from "@/components/ui/button"

import { EarningsTable } from '@/components/earningsTable'

import { getWeekNumber } from "@/app/helpers"

import { GlobalContext } from "@/lib/contexts"
import { useI18n } from "@/lib/contexts/i18n"
import { generateInsight } from "@/lib/userUtils"
import { AnalyticsViewSkeleton } from "@/components/ui/skeleton-loader"
import { ContentLoadingWrapper } from '@/components/ContentLoadingWrapper'

const moodChartConfig = {
  moodAverage: {
    label: "Mood",
    color: "#2f2f8d",
  },
  gratitude: {
    label: "Gratitude",
    color: "#2f2f8d",
  },
  optimism: {
    label: "Optimism",
    color: "#2f2f8d",
  },
  restedness: {
    label: "Restedness",
    color: "#2f2f8d",
  },
  tolerance: {
    label: "Tolerance",
    color: "#2f2f8d",
  },
  selfEsteem: {
    label: "Self Esteem",
    color: "#2f2f8d",
  },
  trust: {
    label: "Trust",
    color: "#2f2f8d",
  },
} satisfies ChartConfig

const productivityChartConfig = {
  moodAverage: {
    label: "Mood",
    color: "#2f2f8d",
  },
  progress: {
    label: "Productivity",
    color: "#2f2f8d",
  },
} satisfies ChartConfig

const moneyChartConfig = {
  balance: {
    label: "Balance",
    color: "#2f2f8d",
  },
  moodAverageScale: {
    label: "Mood Derivate",
    color: "#2f2f8d",
  },
  earnings: {
    label: "Earnings Derivate",
    color: "#2f2f8d",
  },
} satisfies ChartConfig

export const AnalyticsView = ({ timeframe = "day" }) => {
  const fullDate = new Date()
  const date = fullDate.toISOString().split('T')[0]
  const year = Number(date.split('-')[0])
  const weekNumber = getWeekNumber(fullDate)[1]
  const [insight, setInsight] = useState({})
  const [relevantData, setRelevantData] = useState([])
  const { session, setGlobalContext, ...globalContext } = useContext(GlobalContext)
  const { t, locale } = useI18n()
  useEffect(() => {
    generateInsight(setInsight, 'hint', locale)
  }, [locale])

  if (!session?.user) {
    return <AnalyticsViewSkeleton />
  }

  // Function to aggregate daily data by week
const aggregateDataByWeek = (dailyData: any[]) => {
  const weeklyGroups: Record<string, any> = {}
  
  dailyData.forEach((day: any) => {
    const date = new Date(day.date)
    const [_, weekNumber] = getWeekNumber(date)
    const weekKey = t('week.weekNumber', { number: weekNumber })
    if (!weeklyGroups[weekKey]) {
      weeklyGroups[weekKey] = {
        week: weekKey,
        weekNumber: weekNumber,
        count: 0,
        moodAverage: 0,
        gratitude: 0,
        optimism: 0,
        restedness: 0,
        tolerance: 0,
        selfEsteem: 0,
        trust: 0,
        progress: 0,
        moodAverageScale: 0,
        earnings: 0,
        balance: 0,
        dates: []
      }
    }
    
    const week = weeklyGroups[weekKey]
    week.count++
    week.dates.push(day.date)
    
    // Sum up numeric values
    week.moodAverage += parseFloat(day.moodAverage) || 0
    week.gratitude += parseFloat(day.gratitude) || 0
    week.optimism += parseFloat(day.optimism) || 0
    week.restedness += parseFloat(day.restedness) || 0
    week.tolerance += parseFloat(day.tolerance) || 0
    week.selfEsteem += parseFloat(day.selfEsteem) || 0
    week.trust += parseFloat(day.trust) || 0
    week.progress += parseFloat(day.progress) || 0
    week.moodAverageScale += parseFloat(day.moodAverageScale) || 0
    week.earnings += parseFloat(day.earnings) || 0
    week.balance += parseFloat(day.balance) || 0
  })
  
  // Calculate averages
  return Object.values(weeklyGroups).map((week: any) => ({
    week: week.week,
    weekNumber: week.weekNumber,
    moodAverage: (week.moodAverage / week.count).toFixed(2),
    gratitude: (week.gratitude / week.count).toFixed(2),
    optimism: (week.optimism / week.count).toFixed(2),
    restedness: (week.restedness / week.count).toFixed(2),
    tolerance: (week.tolerance / week.count).toFixed(2),
    selfEsteem: (week.selfEsteem / week.count).toFixed(2),
    trust: (week.trust / week.count).toFixed(2),
    progress: (week.progress / week.count).toFixed(2),
    moodAverageScale: (week.moodAverageScale / week.count).toFixed(2),
    earnings: (week.earnings / week.count).toFixed(2),
    balance: (week.balance / week.count).toFixed(2),
    count: week.count,
    dates: week.dates
  })).sort((a: any, b: any) => a.weekNumber - b.weekNumber)
}

  const userDays = session?.user?.entries && session?.user?.entries[year]?.days ? Object.values(session?.user?.entries[year]?.days) : [];
  const userWeeks = session?.user?.entries && session?.user?.entries[year]?.weeks ? Object.values(session?.user?.entries[year]?.weeks) : [];
  
  const plotData = userDays
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()) // Sort by most recent first
    .reduce((acc, cur) => {
      const moodValues = Object.values(cur.mood)
      const noMood = moodValues.every(value => value === 0)
      if (noMood) {
        return acc
      }
      acc = [
        ...acc,
        {
          date: cur.date,
          moodAverage: cur.moodAverage?.toFixed(2),
          gratitude: cur.mood.gratitude?.toFixed(2),
          optimism: cur.mood.optimism?.toFixed(2),
          restedness: cur.mood.restedness?.toFixed(2),
          tolerance: cur.mood.tolerance?.toFixed(2),
          selfEsteem: cur.mood.selfEsteem?.toFixed(2),
          trust: cur.mood.trust?.toFixed(2),
          progress: (cur.progress * 100 / 20).toFixed(2),
          moodAverageScale: cur.moodAverage?.toFixed(2) * 500,
          earnings: Number(cur.earnings).toFixed(2),
          balance:  cur.availableBalance,
        }
      ]
      return acc
    }, [])
    
  // Aggregate daily data by week
  const plotDataWeekly = aggregateDataByWeek(plotData)
    
  const plotWeeks = userWeeks
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()) // Sort by most recent first
    .reduce((acc, cur) => {
      if (!cur.moodAverage || !cur.progress) {
        return acc
      }
      acc = [
        ...acc,
        {
          week: t('week.weekNumber', { number: cur.week }),
          moodAverage: cur.moodAverage?.toFixed(2),
          progress: (cur.progress * 100 / 20).toFixed(2),
        }
      ]
      return acc
    }, [])

  return (
    <ContentLoadingWrapper>
      <div className="max-w-[1200px] w-full m-auto p-4 md:px-32 ">
      <p className="mt-0 mb-8">{insight?.yearAnalysis}</p>
            <h2 className="mb-8 mt-16 text-center scroll-m-20 text-lg font-semibold tracking-tight">{t('dashboard.yourMood')}</h2>

      <ChartContainer config={moodChartConfig}>
        <AreaChart data={plotDataWeekly} accessibilityLayer>
          <CartesianGrid vertical={true} horizontal={true} />
          <Area dataKey="moodAverage" stroke="#cffcdf
            " fill={"#cffcdf"} radius={4} fillOpacity={0.4}
          />
          <Area dataKey="gratitude"  stroke="#6565cc
            " fill="#6565cc
            " radius={4} fillOpacity={0.4}
          />
          <Area dataKey="optimism" stroke="#fbd2b0
            " fill={"#fbd2b0"} radius={4} fillOpacity={0.4}
          />
          <Area dataKey="restedness"  stroke="#fcedd5
            " fill="#fcedd5
            " radius={4} fillOpacity={0.4}
          />
          <Area dataKey="tolerance" stroke="#FACEFB
            " fill={"#FACEFB"} radius={4} fillOpacity={0.4}
          />
          <Area dataKey="selfEsteem"  stroke="#2f2f8d
            " fill="#2f2f8d
            " radius={4} fillOpacity={0.4}
          />
          <Area dataKey="trust" stroke="#f7bfa5
            " fill={"#f7bfa5"} radius={4} fillOpacity={0.4}
          />
          <XAxis
            dataKey="week"
            tickLine={false}
            tickMargin={5}
            axisLine={true}
          />
          <ChartTooltip content={<ChartTooltipContent />} />
          <ChartLegend content={<ChartLegendContent />} />
        </AreaChart>
      </ChartContainer>

      <h2 className="mb-8 mt-16 text-center scroll-m-20 text-lg font-semibold tracking-tight">{t('dashboard.yourProductivity')}</h2>


      <ChartContainer config={productivityChartConfig}>
        <AreaChart data={plotWeeks} accessibilityLayer>
          <CartesianGrid vertical={true} horizontal={true} />
          <Area dataKey="moodAverage" stroke="#cffcdf
            " fill={"#cffcdf"} radius={4} fillOpacity={0.4}
          />
          <Area dataKey="progress"  stroke="#6565cc
            " fill="#6565cc
            " radius={4} fillOpacity={0.4}
          />

          <XAxis
            dataKey="week"
            tickLine={false}
            tickMargin={5}
            axisLine={true}
          />
          <ChartLegend content={<ChartLegendContent />} />
        </AreaChart>
      </ChartContainer>

      <h2 className="mb-8 mt-16 text-center scroll-m-20 text-lg font-semibold tracking-tight">{t('dashboard.yourBalance')}</h2>

      <ChartContainer config={moneyChartConfig}>
        <AreaChart data={plotData} accessibilityLayer>
          <CartesianGrid vertical={true} horizontal={true} />
          <Area dataKey="moodAverageScale" stroke="#cffcdf
            " fill={"#cffcdf"} radius={4} fillOpacity={0.4}
          />
          <Area dataKey="balance"  stroke="#6565cc
            " fill="#6565cc
            " radius={4} fillOpacity={0.4}
          />
          <Area dataKey="earnings" stroke="#f7bfa5
            " fill={"#f7bfa5"} radius={4} fillOpacity={0.4}
          />
          <XAxis
            dataKey="date"
            tickLine={false}
            tickMargin={5}
            axisLine={true}
          />
          <ChartLegend content={<ChartLegendContent />} />
        </AreaChart>
      </ChartContainer>

      <h2 className="mb-8 mt-16 text-center scroll-m-20 text-lg font-semibold tracking-tight">{t('dashboard.yourData')}</h2>

      <EarningsTable data={plotData} />
      </div>
    </ContentLoadingWrapper>
  )
}