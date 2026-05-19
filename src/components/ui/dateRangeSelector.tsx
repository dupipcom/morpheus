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

export function DateRangeSelector({
  startDate,
  endDate,
  onStartChange,
  onEndChange,
  className,
}: DateRangeSelectorProps) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
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
