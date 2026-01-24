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
  distribution: Record<string, number>  // Stores input values (% in % mode, $ in $ mode)
  onChange: (
    distribution: Record<string, number>,  // Returns input values (% in % mode, $ in $ mode)
    metadata?: { 
      mode: 'percentage' | 'currency'
      nominalValues?: Record<string, number>  // Always currency - use for totals
      percentages?: Record<string, number>    // Always percentages
      inputValues?: Record<string, number>    // Raw input values (same as distribution)
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
  distribution,
  onChange,
  onModeChange,
  label,
  mode: initialMode = 'percentage',
  variant = 'vertical',
  disabled = false
}) => {
  const [mode, setMode] = useState<'percentage' | 'currency'>(initialMode)
  const [localDistribution, setLocalDistribution] = useState<Record<string, number>>(distribution)

  // Only sync from parent when distribution changes from external source
  // Don't convert - trust the parent is sending the right values for current mode
  useEffect(() => {
    setLocalDistribution(distribution)
  }, [distribution])

  const handleValueChange = (item: string, value: number) => {
    const updated = { ...localDistribution, [item]: value }
    setLocalDistribution(updated)
    
    // Calculate nominal values for total calculation
    const nominalDistribution: Record<string, number> = {}
    const percentages: Record<string, number> = {}
    
    if (mode === 'percentage') {
      // In percentage mode: input is percentages, calculate nominals
      Object.entries(updated).forEach(([key, percentValue]) => {
        nominalDistribution[key] = (percentValue / 100) * totalBudget
        percentages[key] = percentValue
      })
      // Return the INPUT percentages as distribution (for parent state)
      // But include nominals in metadata for total calculation
      onChange(updated, { 
        mode: 'percentage', 
        nominalValues: nominalDistribution,  // Use for totals
        percentages: updated,                 // Same as distribution
        inputValues: updated                  // What user typed
      })
    } else {
      // In currency mode: input is currency, calculate percentages
      Object.entries(updated).forEach(([key, currencyValue]) => {
        nominalDistribution[key] = currencyValue
        percentages[key] = totalBudget > 0 ? (currencyValue / totalBudget) * 100 : 0
      })
      // Return the INPUT currency as distribution (for parent state)
      // Include nominals in metadata (same as distribution in this mode)
      onChange(updated, { 
        mode: 'currency', 
        nominalValues: updated,  // Use for totals (same as distribution)
        percentages,             // Calculated percentages
        inputValues: updated     // What user typed
      })
    }
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
    // Convert currency values to percentages
    const newDistribution: Record<string, number> = {}
    const nominalDistribution: Record<string, number> = {}
    Object.entries(localDistribution).forEach(([item, currencyValue]) => {
      const percentValue = totalBudget > 0 ? (currencyValue / totalBudget) * 100 : 0
      newDistribution[item] = percentValue
      nominalDistribution[item] = currencyValue
    })
    setLocalDistribution(newDistribution)
    
    // Return percentages as distribution, nominals in metadata
    onChange(newDistribution, { 
      mode: 'percentage',
      nominalValues: nominalDistribution,
      percentages: newDistribution,
      inputValues: newDistribution
    })
    
    setMode('percentage')
    onModeChange?.('percentage')
  }

  const convertToCurrency = () => {
    // Convert percentage values to currency
    const newDistribution: Record<string, number> = {}
    const percentages: Record<string, number> = {}
    Object.entries(localDistribution).forEach(([item, percentValue]) => {
      const currencyValue = (percentValue / 100) * totalBudget
      newDistribution[item] = currencyValue
      percentages[item] = percentValue
    })
    setLocalDistribution(newDistribution)
    
    // Return currency as distribution, nominals in metadata (same as distribution)
    onChange(newDistribution, { 
      mode: 'currency',
      nominalValues: newDistribution,
      percentages,
      inputValues: newDistribution
    })
    
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
          step={isPercentageMode ? "1" : "0.01"}
          value={isPercentageMode ? value.toFixed(0) : value.toFixed(2)}
          onChange={(e) => handleValueChange(item, parseFloat(e.target.value) || 0)}
          className="w-24 h-8 text-xs"
          placeholder={isPercentageMode ? "0%" : "0.00"}
          disabled={disabled}
        />
        <span className="text-xs text-muted-foreground min-w-[60px]">
          {isPercentageMode
            ? `$${(((value || 0) / 100) * totalBudget || 0)}`
            : `${totalBudget > 0 ? ((value / (totalBudget|| 0)) * 100).toFixed(1) : 0}%`
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
                  className="mt-4 w-full"
                  disabled={disabled}
                />
                <div className="mt-4 flex justify-between items-center text-xs text-muted-foreground">
                  <span>{value.toFixed(0)}%</span>
                  <span>${(((value || 0) / 100) * totalBudget || 0).toFixed(2)}</span>
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
