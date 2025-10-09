'use client'
import { type ChartConfig } from "@/components/ui/chart"
import { useState, useEffect, useContext, useMemo } from 'react'
import { Area, CartesianGrid, Bar, AreaChart, XAxis } from "recharts"
 
import { ChartContainer, ChartTooltipContent, ChartTooltip, ChartLegendContent, ChartLegend } from "@/components/ui/chart"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ChevronDown } from "lucide-react"

import { EarningsTable } from '@/components/earningsTable'

import { getWeekNumber } from "@/app/helpers"

import { GlobalContext } from "@/lib/contexts"
import { useI18n } from "@/lib/contexts/i18n"
import { generateInsight, updateUser, handleMoodSubmit, useHint, useUserData, useEnhancedLoadingState } from "@/lib/userUtils"
import { AnalyticsViewSkeleton } from "@/components/ui/skeleton-loader"
import { ContentLoadingWrapper } from '@/components/ContentLoadingWrapper'
import { AgentChat } from "@/components/agent-chat"
import { useFeatureFlag } from "@/lib/hooks/useFeatureFlag"
import { useDebounce } from "@/lib/hooks/useDebounce"

// Chart config generators that use translations
const createMoodChartConfig = (t: (key: string) => string) => ({
  moodAverage: {
    label: t('charts.moodAverage'),
    color: "#2f2f8d",
  },
  gratitude: {
    label: t('charts.gratitude'),
    color: "#2f2f8d",
  },
  optimism: {
    label: t('charts.optimism'),
    color: "#2f2f8d",
  },
  restedness: {
    label: t('charts.restedness'),
    color: "#2f2f8d",
  },
  tolerance: {
    label: t('charts.tolerance'),
    color: "#2f2f8d",
  },
  selfEsteem: {
    label: t('charts.selfEsteem'),
    color: "#2f2f8d",
  },
  trust: {
    label: t('charts.trust'),
    color: "#2f2f8d",
  },
}) satisfies ChartConfig

const createProductivityChartConfig = (t: (key: string) => string) => ({
  moodAverage: {
    label: t('charts.moodAverage'),
    color: "#2f2f8d",
  },
  progress: {
    label: t('charts.progress'),
    color: "#2f2f8d",
  },
}) satisfies ChartConfig

const createMoneyChartConfig = (t: (key: string) => string) => ({
  balance: {
    label: t('charts.balance'),
    color: "#2f2f8d",
  },
  moodAverageScale: {
    label: t('charts.moodAverageScale'),
    color: "#2f2f8d",
  },
  earningsScale: {
    label: t('charts.earningsScale'),
    color: "#2f2f8d",
  },
}) satisfies ChartConfig

// Chart Dimension Selector Component
const ChartDimensionSelector = ({ 
  dimensions, 
  visibleDimensions, 
  onDimensionToggle, 
  title 
}: {
  dimensions: string[]
  visibleDimensions: Record<string, boolean>
  onDimensionToggle: (dimension: string, visible: boolean) => void
  title: string
}) => {
  const { t } = useI18n()
  
  return (
    <div className="flex items-center justify-between mt-12 mb-4">
      <h2 className="text-left scroll-m-20 text-lg font-semibold tracking-tight mr-2">{title}</h2>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="ml-auto">
            {t('charts.dimensions')} <ChevronDown />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {dimensions.map((dimension) => (
            <DropdownMenuCheckboxItem
              key={dimension}
              className="capitalize"
              checked={visibleDimensions[dimension] ?? true}
              onCheckedChange={(value) => onDimensionToggle(dimension, !!value)}
            >
              {t(`charts.${dimension}`) || dimension}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

export const AnalyticsView = ({ timeframe = "day" }) => {
  const fullDate = new Date()
  const date = fullDate.toISOString().split('T')[0]
  const year = Number(date.split('-')[0])
  const weekNumber = getWeekNumber(fullDate)[1]
  const [insight, setInsight] = useState({})
  const [relevantData, setRelevantData] = useState([])
  
  // Chart dimensions state
  const [moodChartDimensions, setMoodChartDimensions] = useState({
    moodAverage: true,
    gratitude: true,
    optimism: true,
    restedness: true,
    tolerance: true,
    selfEsteem: true,
    trust: true,
  })
  
  const [productivityChartDimensions, setProductivityChartDimensions] = useState({
    moodAverage: true,
    progress: true,
  })
  
  const [moneyChartDimensions, setMoneyChartDimensions] = useState({
    moodAverageScale: true,
    balance: true,
    earningsScale: true,
  })
  
  const { session, setGlobalContext, ...globalContext } = useContext(GlobalContext)
  const { t, locale } = useI18n()
  const { isAgentChatEnabled } = useFeatureFlag()
  const { isLoading } = useUserData()
  
  // Type guard to ensure session.user has the expected structure
  const user = useMemo(() => session?.user as any, [session?.user])
  
  // Message history state
  const [currentText, setCurrentText] = useState("")
  const serverText = useMemo(() => (user?.entries && user?.entries[year] && user?.entries[year].days && user?.entries[year].days[date] && user?.entries[year].days[date].analyticsAgentText) || "", [JSON.stringify(user)])
  const messages = user?.entries && user?.entries[year] && user?.entries[year].weeks && user?.entries[year]?.weeks[weekNumber] && user?.entries[year]?.weeks[weekNumber].messages
  const reverseMessages = useMemo(() => messages?.length ? messages.sort((a: any, b: any) => new Date(a.timestamp).getTime() > new Date(b.timestamp).getTime() ? 1 : -1) : [], [JSON.stringify(user)])
  
  // Create chart configs with translations
  const moodChartConfig = createMoodChartConfig(t)
  const productivityChartConfig = createProductivityChartConfig(t)
  const moneyChartConfig = createMoneyChartConfig(t)
  
  // Get user entries for authentication check
  const userEntries = user?.entries;
  
  // Use shared hint hook and update local state when data changes
  const { data: hintData } = useHint(locale, 'hint')
  useEffect(() => {
    if (hintData) setInsight(hintData as any)
  }, [hintData])

  // Initialize currentText from serverText
  useEffect(() => {
    setCurrentText(serverText)
  }, [serverText])

  // Create debounced version of handleTextSubmit
  const debouncedHandleTextSubmit = useDebounce(async (message, field) => {
    await handleMoodSubmit(message, field, fullDate.toISOString().split('T')[0])
  }, 500)

  // Dimension toggle handlers
  const handleMoodDimensionToggle = (dimension: string, visible: boolean) => {
    setMoodChartDimensions(prev => ({ ...prev, [dimension]: visible }))
  }
  
  const handleProductivityDimensionToggle = (dimension: string, visible: boolean) => {
    setProductivityChartDimensions(prev => ({ ...prev, [dimension]: visible }))
  }
  
  const handleMoneyDimensionToggle = (dimension: string, visible: boolean) => {
    setMoneyChartDimensions(prev => ({ ...prev, [dimension]: visible }))
  }

  // Loading gate while initial user fetch populates GlobalContext
  const isDataLoading = useEnhancedLoadingState(isLoading as any, (session as any))
  if (isDataLoading) {
    return <AnalyticsViewSkeleton />
  }

  // Check if user is properly authenticated and session is valid
  if (!user || !user?.userId || Object.keys(user).length === 0) {
    return <AnalyticsViewSkeleton />
  }

  // Additional check to ensure user data is accessible (prevents showing data for expired sessions)
  if (!userEntries || typeof userEntries !== 'object') {
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
  
  // Calculate averages with safe division
  return Object.values(weeklyGroups).map((week: any) => {
    const count = week.count || 1 // Prevent division by zero
    const avgMood = week.moodAverage / count
    const avgBalance = week.balance / count
    return {
      week: week.week,
      weekNumber: week.weekNumber,
      moodAverage: avgMood.toFixed(2),
      gratitude: (week.gratitude / count).toFixed(2),
      optimism: (week.optimism / count).toFixed(2),
      restedness: (week.restedness / count).toFixed(2),
      tolerance: (week.tolerance / count).toFixed(2),
      selfEsteem: (week.selfEsteem / count).toFixed(2),
      trust: (week.trust / count).toFixed(2),
      progress: (week.progress / count).toFixed(2),
      // Keep moodAverageScale consistent using the global balance peak
      moodAverageScale: (balancePeak * (avgMood / 5)).toFixed(2),
      earnings: (week.earnings / count).toFixed(2),
      earningsScale: ((week.earnings / count) * 50).toFixed(2),
      balance: avgBalance.toFixed(2),
      count: week.count,
      dates: week.dates
    }
  }).sort((a: any, b: any) => a.weekNumber - b.weekNumber)
}

  const userDays = user?.entries && user?.entries[year]?.days ? Object.values(user.entries[year].days) : [];
  // Determine a global balance peak to keep moodAverageScale on a consistent scale
  const balancePeak = userDays.reduce((max: number, d: any) => {
    const bal = Number(d?.availableBalance || 0)
    return bal > max ? bal : max
  }, 0)
  const userWeeks = user?.entries && user?.entries[year]?.weeks ? Object.values(user.entries[year].weeks) : [];
  
  const plotData = userDays
    .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime()) // Sort by most recent first
    .reduce((acc: any[], cur: any) => {
      // Check if mood exists and has valid values
      if (!cur.mood || typeof cur.mood !== 'object') {
        return acc
      }
      
      // Coerce all mood values to numbers before validation
      const numericMoodValues = Object.values(cur.mood)
        .map((val) => Number(val))
        .filter((val) => !Number.isNaN(val))
      const noMood = numericMoodValues.length === 0 || numericMoodValues.every((value) => value === 0)
      if (noMood) {
        return acc
      }
      
      // Safe calculations with null checks
      const moodAverage = cur.moodAverage && !isNaN(cur.moodAverage) ? cur.moodAverage : 0
      const progress = cur.progress && !isNaN(cur.progress) ? cur.progress : 0
      const earnings = cur.earnings && !isNaN(Number(cur.earnings)) ? Number(cur.earnings) : 0
      
      // Safe division for progress calculation (avoid division by zero)
      const progressPercentage = progress > 0 && progress <= 20 ? (progress * 100 / 20) : 0
      
      acc = [
        ...acc,
        {
          date: cur.date,
          moodAverage: moodAverage.toFixed(2),
          gratitude: Number(cur.mood.gratitude || 0).toFixed(2),
          optimism: Number(cur.mood.optimism || 0).toFixed(2),
          restedness: Number(cur.mood.restedness || 0).toFixed(2),
          tolerance: Number(cur.mood.tolerance || 0).toFixed(2),
          selfEsteem: Number(cur.mood.selfEsteem || 0).toFixed(2),
          trust: Number(cur.mood.trust || 0).toFixed(2),
          progress: progressPercentage.toFixed(2),
          // Use global balance peak to keep scale consistent across the entire plot
          moodAverageScale: (balancePeak * (moodAverage / 5)).toFixed(2),
          earnings: earnings.toFixed(2),
          earningsScale: earnings.toFixed(2),
          balance: cur.availableBalance || 0,
        }
      ]
      return acc
    }, [])
    
  // Aggregate daily data by week
  const plotDataWeekly = aggregateDataByWeek(plotData)
    
  const plotWeeks = userWeeks
    .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime()) // Sort by most recent first
    .reduce((acc: any[], cur: any) => {
      // Calculate moodAverage from daily data for this week
      let calculatedMoodAverage = 0
      if (cur.week && user?.entries?.[year]?.days) {
        const weekDays = Object.values(user.entries[year].days).filter((day: any) => {
          const dayDate = new Date(day.date)
          const [_, dayWeekNumber] = getWeekNumber(dayDate)
          return dayWeekNumber === cur.week
        })
        
        if (weekDays.length > 0) {
          const daysWithMood = weekDays.filter((day: any) => day.mood && typeof day.mood === 'object')
          if (daysWithMood.length > 0) {
            const moodValues = daysWithMood.map((day: any) => {
              const values = Object.values(day.mood).filter(val => val !== null && val !== undefined && !isNaN(val) && val !== 0)
              return values.length > 0 ? values.reduce((sum: number, val: any) => sum + Number(val), 0) / values.length : 0
            }).filter(val => val > 0)
            
            if (moodValues.length > 0) {
              calculatedMoodAverage = moodValues.reduce((sum: number, val: number) => sum + val, 0) / moodValues.length
            }
          }
        }
      }
      
      // Use calculated moodAverage or fallback to stored value
      const moodAverage = calculatedMoodAverage > 0 ? calculatedMoodAverage : (cur.moodAverage && !isNaN(cur.moodAverage) ? cur.moodAverage : 0)
      const progress = cur.progress && !isNaN(cur.progress) ? cur.progress : 0
      
      // Only include weeks with valid data
      if (moodAverage === 0 && progress === 0) {
        return acc
      }
      
      // Safe division for progress calculation
      const progressPercentage = progress > 0 && progress <= 20 ? (progress * 100 / 20) : 0
      
      acc = [
        ...acc,
        {
          week: t('week.weekNumber', { number: cur.week }),
          moodAverage: moodAverage.toFixed(2),
          progress: progressPercentage.toFixed(2),
        }
      ]
      return acc
    }, [])

  return (
    <ContentLoadingWrapper>
      <div className="max-w-[1200px] w-full m-auto p-4 md:px-32 ">
      <p className="mt-0 mb-8">{(insight as any)?.yearAnalysis}</p>
      
      {isAgentChatEnabled && user?.id ? (
        <div className="mb-16">
          <AgentChat 
            key={reverseMessages}
            onMessageChange={(message) => {
              setCurrentText(message)
              debouncedHandleTextSubmit(message, "analyticsAgentText")
            }}
            history={reverseMessages}
            initialMessage={currentText}
            className="h-96"
          />
        </div>
      ) : undefined}
      
      <ChartDimensionSelector
        dimensions={['moodAverage', 'gratitude', 'optimism', 'restedness', 'tolerance', 'selfEsteem', 'trust']}
        visibleDimensions={moodChartDimensions}
        onDimensionToggle={handleMoodDimensionToggle}
        title={t('dashboard.yourMood')}
      />

      <ChartContainer config={moodChartConfig}>
        <AreaChart data={plotDataWeekly} accessibilityLayer>
          <CartesianGrid vertical={true} horizontal={true} />
          {moodChartDimensions.moodAverage && (
            <Area stackId="2" type="monotone" dataKey="moodAverage" stroke="#cffcdf" fill={"#cffcdf"} radius={4} fillOpacity={0.4} />
          )}
          {moodChartDimensions.gratitude && (
            <Area stackId="1" type="monotone" dataKey="gratitude" stroke="#6565cc" fill="#6565cc" radius={4} fillOpacity={0.4} />
          )}
          {moodChartDimensions.optimism && (
            <Area stackId="1" type="monotone" dataKey="optimism" stroke="#fbd2b0" fill={"#fbd2b0"} radius={4} fillOpacity={0.4} />
          )}
          {moodChartDimensions.restedness && (
            <Area stackId="1" type="monotone" dataKey="restedness" stroke="#fcedd5" fill="#fcedd5" radius={4} fillOpacity={0.4} />
          )}
          {moodChartDimensions.tolerance && (
            <Area stackId="1" type="monotone" dataKey="tolerance" stroke="#FACEFB" fill={"#FACEFB"} radius={4} fillOpacity={0.4} />
          )}
          {moodChartDimensions.selfEsteem && (
            <Area stackId="1" type="monotone" dataKey="selfEsteem" stroke="#2f2f8d" fill="#2f2f8d" radius={4} fillOpacity={0.4} />
          )}
          {moodChartDimensions.trust && (
            <Area stackId="1" type="monotone" dataKey="trust" stroke="#f7bfa5" fill={"#f7bfa5"} radius={4} fillOpacity={0.4} />
          )}
          <XAxis
            dataKey="week"
            tickLine={false}
            tickMargin={5}
            axisLine={true}
          />
          <ChartTooltip content={<ChartTooltipContent />} />
          <ChartLegend verticalAlign="top" content={<ChartLegendContent />} />
        </AreaChart>
      </ChartContainer>

      <ChartDimensionSelector
        dimensions={['moodAverage', 'progress']}
        visibleDimensions={productivityChartDimensions}
        onDimensionToggle={handleProductivityDimensionToggle}
        title={t('dashboard.yourProductivity')}
      />

      <ChartContainer config={productivityChartConfig}>
        <AreaChart data={plotWeeks} accessibilityLayer>
          <CartesianGrid vertical={true} horizontal={true} />
          {productivityChartDimensions.moodAverage && (
            <Area stackId="1" type="monotone" dataKey="moodAverage" stroke="#cffcdf" fill={"#cffcdf"} radius={4} fillOpacity={0.4} />
          )}
          {productivityChartDimensions.progress && (
            <Area stackId="2" type="monotone" dataKey="progress" stroke="#6565cc" fill="#6565cc" radius={4} fillOpacity={0.4} />
          )}

          <XAxis
            dataKey="week"
            tickLine={false}
            tickMargin={5}
            axisLine={true}
          />
          <ChartLegend verticalAlign="top" content={<ChartLegendContent />} />
        </AreaChart>
      </ChartContainer>

      <ChartDimensionSelector
        dimensions={['moodAverageScale', 'balance', 'earningsScale']}
        visibleDimensions={moneyChartDimensions}
        onDimensionToggle={handleMoneyDimensionToggle}
        title={t('dashboard.yourBalance')}
      />

      <ChartContainer config={moneyChartConfig}>
        <AreaChart data={plotDataWeekly} accessibilityLayer>
          <CartesianGrid vertical={true} horizontal={true} />
          {moneyChartDimensions.moodAverageScale && (
            <Area stackId="1" type="monotone" dataKey="moodAverageScale" stroke="#cffcdf" fill={"#cffcdf"} radius={4} fillOpacity={0.4} />
          )}
          {moneyChartDimensions.balance && (
            <Area stackId="2" type="monotone" dataKey="balance" stroke="#6565cc" fill="#6565cc" radius={4} fillOpacity={0.4} />
          )}
          {moneyChartDimensions.earningsScale && (
            <Area stackId="3" type="monotone" dataKey="earningsScale" stroke="#f7bfa5" fill={"#f7bfa5"} radius={4} fillOpacity={0.4} />
          )}
          <XAxis
            dataKey="week"
            tickLine={false}
            tickMargin={5}
            axisLine={true}
          />
          <ChartLegend verticalAlign="top" content={<ChartLegendContent />}  />
        </AreaChart>
      </ChartContainer>

      <h2 className="mb-8 mt-16 text-center scroll-m-20 text-lg font-semibold tracking-tight">{t('dashboard.yourData')}</h2>

      <EarningsTable data={plotData} />
      </div>
    </ContentLoadingWrapper>
  )
}