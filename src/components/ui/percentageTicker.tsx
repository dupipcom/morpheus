'use client'

import React from 'react'
import { ChevronUp, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PercentageTickerProps {
  value: number // Percentage change value (can be positive or negative)
  className?: string
  showZero?: boolean // Whether to show when value is 0
}

/**
 * Reusable percentage ticker component that displays up/down arrows with percentage change
 * Can be used for various metrics like task completion, mood average, etc.
 */
export function PercentageTicker({ value, className, showZero = false }: PercentageTickerProps) {
  // Don't render if value is 0 and showZero is false
  if (value === 0 && !showZero) {
    return null
  }

  const isPositive = value > 0
  const isNegative = value < 0
  const absValue = Math.abs(value)
  const formattedValue = absValue.toFixed(1)

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1 text-xs font-medium shrink-0 mr-4',
        isPositive && 'text-success',
        isNegative && 'text-destructive',
        value === 0 && 'text-primary',
        className
      )}
    >
      {isPositive && <ChevronUp className={cn(
        'inline-flex items-center gap-1 text-xs font-medium shrink-0',
        isPositive && 'text-success',
        isNegative && 'text-destructive',
        value === 0 && 'text-muted-foreground',
        className
      )} />}
      {isNegative && <ChevronDown className={cn(
        'inline-flex items-center gap-1 text-xs font-medium shrink-0',
        isPositive && 'text-success',
        isNegative && 'text-destructive',
        value === 0 && 'text-muted-foreground',
        className
      )} />}
      <span className="group-hover:text-muted group-data-[highlighted]:text-muted group-focus:text-muted">{formattedValue}%</span>
    </div>
  )
}

