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
} from "@/components/ui/dropdownMenu"
import { ChevronDown } from "lucide-react"

import { EarningsTable } from '@/components/earningsTable'

import { getWeekNumber } from "@/app/helpers"

import { GlobalContext } from "@/lib/contexts"
import { useI18n } from "@/lib/contexts/i18n"
import { generateInsight, updateUser, handleMoodSubmit, useHint, useUserData, useEnhancedLoadingState } from "@/lib/utils/userUtils"
import { DashboardViewSkeleton } from "@/components/ui/skeletonLoader"
import { ContentLoadingWrapper } from '@/components/contentLoadingWrapper'
import { AgentChat } from "@/components/agentChat"
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
  moodAverage: {
    label: t('charts.moodAverage'),
    color: "#cffcdf",
  },
  profit: {
    label: t('charts.profit'),
    color: "#6565cc",
  },
  stash: {
    label: t('charts.stash'),
    color: "#fbd2b0",
  },
  withdraw: {
    label: t('charts.withdrawn'),
    color: "#f7bfa5",
  },
  balance: {
    label: t('charts.balance'),
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

export const DashboardView = ({ timeframe = "day" }) => {
  const fullDate = new Date()
  const date = fullDate.toISOString().split('T')[0]
  const year = Number(date.split('-')[0])
  const weekNumber = getWeekNumber(fullDate)[1]
  const [insight, setInsight] = useState({})
  const [relevantData, setRelevantData] = useState([])
  const [days, setDays] = useState<any[]>([])
  const [isLoadingDays, setIsLoadingDays] = useState(true)
  
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
    moodAverage: true,
    profit: true,
    stash: true,
    withdrawn: true,
    balance: true,
  })
  
  const { session, setGlobalContext, ...globalContext } = useContext(GlobalContext)
  const { t, locale } = useI18n()
  const { isAgentChatEnabled } = useFeatureFlag()
  const { isLoading } = useUserData()
  
  // Type guard to ensure session.user has the expected structure
  const user = useMemo(() => session?.user as any, [session?.user])
  
  // Fetch days from Prisma Day model
  useEffect(() => {
    const fetchDays = async () => {
      if (!user?.id) return
      
      try {
        setIsLoadingDays(true)
        const response = await fetch(`/api/v1/days?year=${year}`)
        if (!response.ok) {
          throw new Error('Failed to fetch days')
        }
        const data = await response.json()
        setDays(data.days || [])
      } catch (error) {
        console.error('Error fetching days:', error)
        setDays([])
      } finally {
        setIsLoadingDays(false)
      }
    }
    
    fetchDays()
  }, [user?.id, year])
  
  // Message history state (weekly agentConversation) - TODO: migrate to separate model
  const [currentText, setCurrentText] = useState("")
  const conversation = null // TODO: fetch from separate conversation model
  const reverseMessages = useMemo(() => [], [])
  
  // Create chart configs with translations
  const moodChartConfig = createMoodChartConfig(t)
  const productivityChartConfig = createProductivityChartConfig(t)
  const moneyChartConfig = createMoneyChartConfig(t)
  
  // Use shared hint hook and update local state when data changes
  const { data: hintData } = useHint(locale, 'hint')
  useEffect(() => {
    if (hintData) setInsight(hintData as any)
  }, [hintData])

  // Reset input when week conversation changes
  useEffect(() => {
    setCurrentText("")
  }, [JSON.stringify(reverseMessages)])

  // No longer persisting daily analyticsAgentText; weekly conversation is saved via /api/v1/chat
  const debouncedHandleTextSubmit = useDebounce(async (_message, _field) => {
    return
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

  // Loading gate while initial user fetch populates GlobalContext or days are loading
  const isDataLoading = useEnhancedLoadingState(isLoading as any, (session as any)) || isLoadingDays
  if (isDataLoading) {
    return <DashboardViewSkeleton />
  }

  // Check if user is properly authenticated and session is valid
  if (!user || !user?.userId || Object.keys(user).length === 0) {
    return <DashboardViewSkeleton />
  }

  // Additional check to ensure user data is accessible (prevents showing data for expired sessions)
  if (!user || !user?.userId) {
    return <DashboardViewSkeleton />
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
        profit: 0,
        stash: 0,
        withdraw: 0,
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
    week.profit += parseFloat(day.profit) || 0
    week.stash += parseFloat(day.stash) || 0
    week.withdraw += parseFloat(day.withdraw) || 0
    week.balance += parseFloat(day.balance) || 0
  })
  
  // Calculate averages with safe division
  return Object.values(weeklyGroups).map((week: any) => {
    const count = week.count || 1 // Prevent division by zero
    const avgMood = week.moodAverage / count
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
      profit: (week.profit / count).toFixed(2),
      stash: (week.stash / count).toFixed(2),
      withdraw: (week.withdraw / count).toFixed(2),
      balance: (week.balance / count).toFixed(2),
      count: week.count,
      dates: week.dates
    }
  }).sort((a: any, b: any) => a.weekNumber - b.weekNumber)
}

  // Use days from Prisma Day model instead of user.entries
  // Weekly data - TODO: migrate to separate Week model or derive from Day model
  const userWeeks: any[] = [];
  
  const plotData = days
    .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime()) // Sort by most recent first
    .reduce((acc: any[], cur: any) => {
      // Check if mood exists and has valid values
      if (!cur.mood || typeof cur.mood !== 'object') {
        return acc
      }
      
      // Determine if the entire mood set is zero; only drop the day if all six are zero
      const moodKeys = ['gratitude', 'optimism', 'restedness', 'tolerance', 'selfEsteem', 'trust'] as const
      const numericMoodValues = moodKeys.map((k) => Number((cur.mood as any)?.[k]) || 0)
      const noMood = numericMoodValues.every((value) => value === 0)
      if (noMood) {
        return acc
      }
      
      // Use moodAverage from API response or recalculate
      const moodAverage = cur.moodAverage || (() => {
        const keys = ['gratitude', 'optimism', 'restedness', 'tolerance', 'selfEsteem', 'trust'] as const
        const values = keys.map((k) => Number((cur.mood as any)?.[k]) || 0)
        const sum = values.reduce((acc: number, val: number) => acc + val, 0)
        return sum / keys.length
      })()
      // Progress from day.progress is already 0-100 (percentage), no conversion needed
      const progress = cur.progress && !isNaN(cur.progress) ? Number(cur.progress) : 0
      const profit = cur.profit && !isNaN(Number(cur.profit)) ? Number(cur.profit) : 0
      const stash = cur.stash && !isNaN(Number(cur.stash)) ? Number(cur.stash) : 0
      const withdraw = cur.withdrawn && !isNaN(Number(cur.withdrawn)) ? Number(cur.withdrawn) : 0
      const balance = cur.availableBalance && !isNaN(Number(cur.availableBalance)) ? Number(cur.availableBalance) : 0
      
      // Progress is already a percentage (0-100) from day.progress
      const progressPercentage = progress
      
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
          profit: profit.toFixed(2),
          stash: stash.toFixed(2),
          withdraw: withdraw.toFixed(2),
          balance: balance.toFixed(2),
        }
      ]
      return acc
    }, [])
    
  // Aggregate daily data by week
  const plotDataWeekly = aggregateDataByWeek(plotData)
  
  // Calculate the maximum value among profit, stash, withdraw, and balance for scaling moodAverage
  const maxValue = plotDataWeekly.reduce((max: number, week: any) => {
    const profit = parseFloat(week.profit) || 0
    const stash = parseFloat(week.stash) || 0
    const withdraw = parseFloat(week.withdraw) || 0
    const balance = parseFloat(week.balance) || 0
    const weekMax = Math.max(profit, stash, withdraw, balance)
    return Math.max(max, weekMax)
  }, 0)
  
  // Scale moodAverage to 50% of maxValue (so max moodAverage of 5 maps to 50% of chart height)
  // moodAverage is on a 0-5 scale, so we scale it: (moodAverage / 5) * (maxValue * 0.5)
  const scaledPlotDataWeekly = plotDataWeekly.map((week: any) => {
    const moodAvg = parseFloat(week.moodAverage) || 0
    const scaledMoodAverage = maxValue > 0 ? ((moodAvg / 5) * (maxValue * 0.5)).toFixed(2) : '0'
    return {
      ...week,
      moodAverageScaled: scaledMoodAverage
    }
  })
    
  // Create plotWeeks from plotDataWeekly for productivity chart
  const plotWeeks = plotDataWeekly
    .map((week: any) => {
      const moodAverage = parseFloat(week.moodAverage) || 0
      const progress = parseFloat(week.progress) || 0
      
      // Only include weeks with valid data
      if (moodAverage === 0 && progress === 0) {
        return null
      }
      
      // Scale progress from 0-100 to 0-5 to match moodAverage scale (0-5)
      const progressScaled = (progress / 100) * 5
      
      return {
        week: week.week,
          moodAverage: moodAverage.toFixed(2),
        progress: progressScaled.toFixed(2),
        }
    })
    .filter((week: any) => week !== null)

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
            <Area stackId="1" type="monotone" dataKey="moodAverage" stroke="#cffcdf" fill={"#cffcdf"} radius={4} fillOpacity={0.4} />
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
          <ChartLegend verticalAlign="top" content={<ChartLegendContent payload={[]} />} />
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
          <ChartLegend verticalAlign="top" content={<ChartLegendContent payload={[]} />} />
        </AreaChart>
      </ChartContainer>

      <ChartDimensionSelector
        dimensions={['moodAverage', 'profit', 'stash', 'withdrawn', 'balance']}
        visibleDimensions={moneyChartDimensions}
        onDimensionToggle={handleMoneyDimensionToggle}
        title={t('dashboard.yourBalance')}
      />

      <ChartContainer config={moneyChartConfig}>
        <AreaChart data={scaledPlotDataWeekly} accessibilityLayer>
          <CartesianGrid vertical={true} horizontal={true} />
          {moneyChartDimensions.moodAverage && (
            <Area stackId="1" type="monotone" dataKey="moodAverageScaled" stroke="#cffcdf" fill={"#cffcdf"} radius={4} fillOpacity={0.4} />
          )}
          {moneyChartDimensions.profit && (
            <Area stackId="2" type="monotone" dataKey="profit" stroke="#6565cc" fill="#6565cc" radius={4} fillOpacity={0.4} />
          )}
          {moneyChartDimensions.stash && (
            <Area stackId="3" type="monotone" dataKey="stash" stroke="#fbd2b0" fill={"#fbd2b0"} radius={4} fillOpacity={0.4} />
          )}
          {moneyChartDimensions.withdrawn && (
            <Area stackId="4" type="monotone" dataKey="withdraw" stroke="#f7bfa5" fill={"#f7bfa5"} radius={4} fillOpacity={0.4} />
          )}
          {moneyChartDimensions.balance && (
            <Area stackId="5" type="monotone" dataKey="balance" stroke="#2f2f8d" fill={"#2f2f8d"} radius={4} fillOpacity={0.4} />
          )}
          <XAxis
            dataKey="week"
            tickLine={false}
            tickMargin={5}
            axisLine={true}
          />
          <ChartTooltip content={<ChartTooltipContent />} />
          <ChartLegend verticalAlign="top" content={<ChartLegendContent payload={[]} />}  />
        </AreaChart>
      </ChartContainer>

      <h2 className="mb-8 mt-16 text-center scroll-m-20 text-lg font-semibold tracking-tight">{t('dashboard.yourData')}</h2>

      <EarningsTable data={plotData as any} />
      </div>
    </ContentLoadingWrapper>
  )
}