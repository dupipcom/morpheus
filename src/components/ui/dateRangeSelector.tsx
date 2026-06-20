'use client'

import React from 'react'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { CalendarIcon } from 'lucide-react'
import { cn } from '@/lib/utils/utils'

export interface DateRangeSelectorProps {
  startDate: Date
  endDate: Date
  onStartChange: (d: Date) => void
  onEndChange: (d: Date) => void
  /** Extra className applied to the wrapper div */
  className?: string
}

const fmt = (d: Date) =>
  d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

const PRESETS = [
  { label: '1m', days: 30 },
  { label: '3m', days: 90 },
  { label: '6m', days: 180 },
  { label: '1y', days: 365 },
] as const

export function DateRangeSelector({
  startDate,
  endDate,
  onStartChange,
  onEndChange,
  className,
}: DateRangeSelectorProps) {
  const applyPreset = (days: number) => {
    const today = new Date()
    const start = new Date(today)
    start.setDate(today.getDate() - days)
    onStartChange(start)
    onEndChange(today)
  }

  const activePreset = (() => {
    const today = new Date()
    const endDiffMs = Math.abs(endDate.getTime() - today.getTime())
    if (endDiffMs > 24 * 60 * 60 * 1000) return null
    for (const preset of PRESETS) {
      const expected = new Date(today)
      expected.setDate(today.getDate() - preset.days)
      const startDiffMs = Math.abs(startDate.getTime() - expected.getTime())
      if (startDiffMs < 24 * 60 * 60 * 1000) return preset.label
    }
    return null
  })()

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {PRESETS.map((preset) => (
        <Button
          key={preset.label}
          variant={activePreset === preset.label ? 'default' : 'outline'}
          size="sm"
          onClick={() => applyPreset(preset.days)}
        >
          {preset.label}
        </Button>
      ))}

      <span className="text-sm text-muted-foreground">|</span>

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="justify-start text-left font-normal">
            <CalendarIcon className="mr-2 h-4 w-4" />
            {fmt(startDate)}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={startDate}
            onSelect={(d) => d && onStartChange(d)}
            disabled={(d) => d > endDate}
          />
        </PopoverContent>
      </Popover>

      <span className="text-sm text-muted-foreground">—</span>

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="justify-start text-left font-normal">
            <CalendarIcon className="mr-2 h-4 w-4" />
            {fmt(endDate)}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={endDate}
            onSelect={(d) => d && onEndChange(d)}
            disabled={(d) => d < startDate || d > new Date()}
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}
