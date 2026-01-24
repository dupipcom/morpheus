'use client'

import React, { useState, useEffect } from 'react'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Percent, DollarSign } from 'lucide-react'

interface BudgetDistributionInputProps {
  items: string[]
  totalBudget: number
  distribution: Record<string, number>
  onChange: (distribution: Record<string, number>) => void
  onModeChange?: (mode: 'percentage' | 'currency') => void
  label: string
  mode?: 'percentage' | 'currency'
  variant?: 'vertical' | 'horizontal'
}

export const BudgetDistributionInput: React.FC<BudgetDistributionInputProps> = ({
  items,
  totalBudget,
  distribution,
  onChange,
  onModeChange,
  label,
  mode: initialMode = 'percentage',
  variant = 'vertical'
}) => {
  const [mode, setMode] = useState<'percentage' | 'currency'>(initialMode)
  const [localDistribution, setLocalDistribution] = useState<Record<string, number>>(distribution)

  useEffect(() => {
    setLocalDistribution(distribution)
  }, [distribution])

  const handleValueChange = (item: string, value: number) => {
    const updated = { ...localDistribution, [item]: value }
    setLocalDistribution(updated)
    onChange(updated)
  }

  const getTotalAllocated = () => {
    return Object.values(localDistribution).reduce((sum, val) => sum + val, 0)
  }

  const getRemaining = () => {
    const total = getTotalAllocated()
    if (mode === 'percentage') {
      return 100 - total
    } else {
      return totalBudget - total
    }
  }

  const convertToPercentage = () => {
    const newDistribution: Record<string, number> = {}
    Object.entries(localDistribution).forEach(([item, value]) => {
      newDistribution[item] = totalBudget > 0 ? (value / totalBudget) * 100 : 0
    })
    setLocalDistribution(newDistribution)
    onChange(newDistribution)
    setMode('percentage')
    onModeChange?.('percentage')
  }

  const convertToCurrency = () => {
    const newDistribution: Record<string, number> = {}
    Object.entries(localDistribution).forEach(([item, value]) => {
      newDistribution[item] = (value / 100) * totalBudget
    })
    setLocalDistribution(newDistribution)
    onChange(newDistribution)
    setMode('currency')
    onModeChange?.('currency')
  }

  const remaining = getRemaining()
  const isPercentageMode = mode === 'percentage'

  // Horizontal variant for per-task inputs
  if (variant === 'horizontal') {
    const item = items[0] // For horizontal variant, expect single item
    const value = localDistribution[item] || 0

    return (
      <div className="flex items-center gap-2">
        <div className="flex gap-1">
          <Button
            type="button"
            size="sm"
            variant={isPercentageMode ? 'default' : 'outline'}
            onClick={isPercentageMode ? undefined : convertToPercentage}
            className="h-8 px-2"
          >
            <Percent className="h-3 w-3" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant={!isPercentageMode ? 'default' : 'outline'}
            onClick={!isPercentageMode ? undefined : convertToCurrency}
            className="h-8 px-2"
          >
            <DollarSign className="h-3 w-3" />
          </Button>
        </div>
        <Input
          type="number"
          min="0"
          step={isPercentageMode ? "1" : "0.01"}
          value={isPercentageMode ? value.toFixed(0) : value.toFixed(2)}
          onChange={(e) => handleValueChange(item, parseFloat(e.target.value) || 0)}
          className="w-24 h-8 text-xs"
          placeholder={isPercentageMode ? "0%" : "0.00"}
        />
        <span className="text-xs text-muted-foreground min-w-[60px]">
          {isPercentageMode
            ? `$${((value / 100) * totalBudget).toFixed(2)}`
            : `${totalBudget > 0 ? ((value / totalBudget) * 100).toFixed(1) : 0}%`
          }
        </span>
      </div>
    )
  }

  // Vertical variant (default)
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">
          {label}
          <span className="ml-2 text-xs text-muted-foreground">
            (Remaining: {isPercentageMode ? `${remaining.toFixed(0)}%` : `$${remaining.toFixed(2)}`})
          </span>
        </div>
        <div className="flex gap-1">
          <Button
            type="button"
            size="sm"
            variant={isPercentageMode ? 'default' : 'outline'}
            onClick={isPercentageMode ? undefined : convertToPercentage}
            className="h-7 px-2"
          >
            <Percent className="h-3 w-3" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant={!isPercentageMode ? 'default' : 'outline'}
            onClick={!isPercentageMode ? undefined : convertToCurrency}
            className="h-7 px-2"
          >
            <DollarSign className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {items.map(item => {
        const value = localDistribution[item] || 0
        const displayValue = isPercentageMode
          ? `${value.toFixed(0)}%`
          : `$${value.toFixed(2)}`

        return (
          <div key={item} className="space-y-1">
            <Label className="text-xs capitalize">{item}</Label>
            
            {isPercentageMode ? (
              <>
                <Slider
                  value={[value]}
                  onValueChange={(values) => handleValueChange(item, values[0])}
                  min={0}
                  max={100}
                  step={1}
                  className="w-full"
                />
                <div className="flex justify-between items-center text-xs text-muted-foreground">
                  <span>{value.toFixed(0)}%</span>
                  <span>${((value / 100) * totalBudget).toFixed(2)}</span>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={value.toFixed(2)}
                    onChange={(e) => handleValueChange(item, parseFloat(e.target.value) || 0)}
                    className="w-32 h-8 text-xs"
                  />
                  <span className="text-xs text-muted-foreground">
                    ({totalBudget > 0 ? ((value / totalBudget) * 100).toFixed(1) : 0}%)
                  </span>
                </div>
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}
