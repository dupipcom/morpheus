'use client'

import { useTickerData } from '@/lib/hooks/useTickerData'
import { useI18n } from '@/lib/contexts/i18n'

interface TickerStripProps {
  className?: string
}

export function TickerStrip({ className = '' }: TickerStripProps) {
  const { tickerData, isLoading } = useTickerData()
  const { t } = useI18n()

  if (isLoading || !tickerData) {
    return (
      <div className={`h-4 animate-pulse absolute top-0 left-0 right-0 ${className}`}>
        <div className="h-full animate-pulse"></div>
      </div>
    )
  }

  const formatTickerValue = (value: number | undefined | null) => {
    // Handle undefined, null, NaN, and 0 values
    if (value === undefined || value === null || isNaN(value)) {
      return '0.0%'
    }
    
    const sign = value >= 0 ? '+' : ''
    return `${sign}${value.toFixed(1)}%`
  }

  const getTickerColor = (value: number | undefined | null) => {
    // Handle undefined, null, NaN, and 0 values
    if (value === undefined || value === null || isNaN(value)) {
      return 'text-muted-foreground'
    }
    
    if (value > 0) return 'text-success'
    if (value < 0) return 'text-destructive'
    return 'text-muted-foreground'
  }

  const dailyTickerText = `D: ${formatTickerValue(tickerData.dailyTicker)}`
  const weeklyTickerText = `W: ${formatTickerValue(tickerData.weeklyTicker)}`
  const threeDayTickerText = `3D: ${formatTickerValue(tickerData.threeDayTicker)}`
  const fourWeekTickerText = `4W: ${formatTickerValue(tickerData.fourWeekTicker)}`
  const twentyEightWeekTickerText = `28W: ${formatTickerValue(tickerData.twentyEightWeekTicker)}`
  const fiftySixWeekTickerText = `56W: ${formatTickerValue(tickerData.fiftySixWeekTicker)}`
  
  // Create a long string that will scroll
  const tickerContent = `${dailyTickerText} • ${weeklyTickerText} • ${threeDayTickerText} • ${fourWeekTickerText} • ${twentyEightWeekTickerText} • ${fiftySixWeekTickerText} • `

  return (
    <div className={`bg-transparent h-4 overflow-hidden relative flex justify-center m-auto top-0 left-0 right-0 ${className}`}>
      <div className="h-full flex items-center max-w-[768px] overflow-hidden">
        <div className="flex animate-scroll whitespace-nowrap text-xs font-medium">
          <span className={`${getTickerColor(tickerData.dailyTicker)} mr-4`}>
            {dailyTickerText}
          </span>
          <span className={`${getTickerColor(tickerData.weeklyTicker)} mr-4`}>
            {weeklyTickerText}
          </span>
          <span className={`${getTickerColor(tickerData.threeDayTicker)} mr-4`}>
            {threeDayTickerText}
          </span>
          <span className={`${getTickerColor(tickerData.fourWeekTicker)} mr-4`}>
            {fourWeekTickerText}
          </span>
          <span className={`${getTickerColor(tickerData.twentyEightWeekTicker)} mr-4`}>
            {twentyEightWeekTickerText}
          </span>
          <span className={`${getTickerColor(tickerData.fiftySixWeekTicker)} mr-4`}>
            {fiftySixWeekTickerText}
          </span>
        </div>
        {/* Duplicate for seamless loop */}
        <div className="flex animate-scroll whitespace-nowrap text-xs font-medium">
          <span className={`${getTickerColor(tickerData.dailyTicker)} mr-4`}>
            {dailyTickerText}
          </span>
          <span className={`${getTickerColor(tickerData.weeklyTicker)} mr-4`}>
            {weeklyTickerText}
          </span>
          <span className={`${getTickerColor(tickerData.threeDayTicker)} mr-4`}>
            {threeDayTickerText}
          </span>
          <span className={`${getTickerColor(tickerData.fourWeekTicker)} mr-4`}>
            {fourWeekTickerText}
          </span>
          <span className={`${getTickerColor(tickerData.twentyEightWeekTicker)} mr-4`}>
            {twentyEightWeekTickerText}
          </span>
          <span className={`${getTickerColor(tickerData.fiftySixWeekTicker)} mr-4`}>
            {fiftySixWeekTickerText}
          </span>
        </div>
      </div>
    </div>
  )
}
