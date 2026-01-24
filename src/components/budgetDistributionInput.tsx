'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Percent, DollarSign } from 'lucide-react'
import { 
  AllocationType, 
  percentToNominal, 
  nominalToPercent,
  getAllocationNominal,
  getAllocationPercent
} from '@/lib/utils/budgetDistributionUtils'

interface BudgetDistributionInputProps {
  items: string[]
  totalBudget: number
  allocations: Record<string, AllocationType>  // Stores both nominal and percent
  onChange: (
    allocations: Record<string, AllocationType>,
    metadata?: { 
      mode: 'percentage' | 'currency'
      nominalValues: Record<string, number>
      percentages: Record<string, number>
    }
  ) => void
  onModeChange?: (mode: 'percentage' | 'currency') => void
  label: string
  mode?: 'percentage' | 'currency'
  variant?: 'vertical' | 'horizontal'
  disabled?: boolean
}

export const BudgetDistributionInput: React.FC<BudgetDistributionInputProps> = ({
  items,
  totalBudget,
  allocations,
  onChange,
  onModeChange,
  label,
  mode: initialMode = 'percentage',
  variant = 'vertical',
  disabled = false
}) => {
  const [mode, setMode] = useState<'percentage' | 'currency'>(initialMode)
  
  // Store full AllocationType internally for proper mode switching
  const [localAllocations, setLocalAllocations] = useState<Record<string, AllocationType>>(allocations || {})

  // Sync from parent when allocations change
  useEffect(() => {
    if (allocations) {
      setLocalAllocations(allocations)
    }
  }, [allocations])

  // Get display value based on current mode
  const getDisplayValue = (item: string): number => {
    const alloc = localAllocations[item]
    if (!alloc) return 0
    if (mode === 'percentage') {
      return getAllocationPercent(alloc, totalBudget)
    } else {
      return getAllocationNominal(alloc, totalBudget)
    }
  }

  // Compute current distribution for display
  const localDistribution = useMemo(() => {
    const result: Record<string, number> = {}
    items.forEach(item => {
      result[item] = getDisplayValue(item)
    })
    return result
  }, [localAllocations, mode, items, totalBudget])

  const handleValueChange = (item: string, value: number) => {
    // Update local allocations with both nominal and percent
    const newAllocations = { ...localAllocations }
    
    if (mode === 'percentage') {
      newAllocations[item] = {
        percent: value,
        nominal: percentToNominal(value, totalBudget)
      }
    } else {
      newAllocations[item] = {
        nominal: value,
        percent: nominalToPercent(value, totalBudget)
      }
    }
    
    setLocalAllocations(newAllocations)
    
    // Build output metadata
    const nominalValues: Record<string, number> = {}
    const percentages: Record<string, number> = {}
    
    Object.entries(newAllocations).forEach(([key, alloc]) => {
      nominalValues[key] = alloc.nominal ?? 0
      percentages[key] = alloc.percent ?? 0
    })
    
    onChange(newAllocations, { mode, nominalValues, percentages })
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
    setMode('percentage')
    onModeChange?.('percentage')
    
    // Emit current values
    const nominalValues: Record<string, number> = {}
    const percentages: Record<string, number> = {}
    
    Object.entries(localAllocations).forEach(([key, alloc]) => {
      nominalValues[key] = alloc.nominal ?? 0
      percentages[key] = alloc.percent ?? 0
    })
    
    onChange(localAllocations, { mode: 'percentage', nominalValues, percentages })
  }

  const convertToCurrency = () => {
    setMode('currency')
    onModeChange?.('currency')
    
    // Emit current values
    const nominalValues: Record<string, number> = {}
    const percentages: Record<string, number> = {}
    
    Object.entries(localAllocations).forEach(([key, alloc]) => {
      nominalValues[key] = alloc.nominal ?? 0
      percentages[key] = alloc.percent ?? 0
    })
    
    onChange(localAllocations, { mode: 'currency', nominalValues, percentages })
  }

  const remaining = getRemaining()
  const isPercentageMode = mode === 'percentage'

  // Horizontal variant for per-task inputs
  if (variant === 'horizontal') {
    const item = items[0] // For horizontal variant, expect single item
    const value = localDistribution[item] || 0
    const alloc = localAllocations[item] || {}
    
    // Get the corresponding value in the other unit for display
    const nominalValue = getAllocationNominal(alloc, totalBudget)
    const percentValue = getAllocationPercent(alloc, totalBudget)

    return (
      <div className="flex items-center gap-2">
        <div className="flex gap-1">
          <Button
            type="button"
            size="sm"
            variant={isPercentageMode ? 'default' : 'outline'}
            onClick={isPercentageMode ? undefined : convertToPercentage}
            className="h-8 px-2"
            disabled={disabled}
          >
            <Percent className="h-3 w-3" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant={!isPercentageMode ? 'default' : 'outline'}
            onClick={!isPercentageMode ? undefined : convertToCurrency}
            className="h-8 px-2"
            disabled={disabled}
          >
            <DollarSign className="h-3 w-3" />
          </Button>
        </div>
        <Input
          type="number"
          min="0"
          max={isPercentageMode ? "100" : undefined}
          step="0.01"
          value={value}
          onChange={(e) => handleValueChange(item, parseFloat(e.target.value) || 0)}
          className="w-24 h-8 text-xs"
          placeholder={isPercentageMode ? "0%" : "$0.00"}
          disabled={disabled}
        />
        <span className="text-xs text-muted-foreground min-w-[60px]">
          {isPercentageMode
            ? `$${nominalValue.toFixed(2)}`
            : `${percentValue.toFixed(1)}%`
          }
        </span>
      </div>
    )
  }

  // Vertical variant (default)
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium basis-1/2 max-w-[50%]">
          {label}
          <span className="block ml-2 text-xs text-muted-foreground ">
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
            disabled={disabled}
          >
            <Percent className="h-3 w-3" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant={!isPercentageMode ? 'default' : 'outline'}
            onClick={!isPercentageMode ? undefined : convertToCurrency}
            className="h-7 px-2"
            disabled={disabled}
          >
            <DollarSign className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {items.map(item => {
        const value = localDistribution[item] || 0
        const alloc = localAllocations[item] || {}
        const nominalValue = getAllocationNominal(alloc, totalBudget)
        const percentValue = getAllocationPercent(alloc, totalBudget)

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
                  className="mt-4 w-full"
                  disabled={disabled}
                />
                <div className="mt-4 flex justify-between items-center text-xs text-muted-foreground">
                  <span>{percentValue.toFixed(0)}%</span>
                  <span>${nominalValue.toFixed(2)}</span>
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
                    disabled={disabled}
                  />
                  <span className="text-xs text-muted-foreground">
                    ({percentValue.toFixed(1)}%)
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
