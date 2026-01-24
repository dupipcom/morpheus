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
  onChange: (
    nominalValues: Record<string, number>,  // Always returns currency values for totals
    metadata?: { 
      mode: 'percentage' | 'currency'
      percentages?: Record<string, number>  // Percentage values (in both modes)
      inputValues?: Record<string, number>  // Raw input values in current mode
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
    
    // Always return nominal (currency) values as primary for total calculation
    // Include percentages and raw input values in metadata
    if (mode === 'percentage') {
      // In percentage mode, convert to nominal for primary return
      const nominalDistribution: Record<string, number> = {}
      Object.entries(updated).forEach(([key, percentValue]) => {
        nominalDistribution[key] = (percentValue / 100) * totalBudget
      })
      onChange(nominalDistribution, { 
        mode: 'percentage', 
        percentages: updated,  // The percentage values user entered
        inputValues: updated   // Same as percentages in this mode
      })
    } else {
      // In currency mode, nominal values are the input values
      const percentages: Record<string, number> = {}
      Object.entries(updated).forEach(([key, currencyValue]) => {
        percentages[key] = totalBudget > 0 ? (currencyValue / totalBudget) * 100 : 0
      })
      onChange(updated, { 
        mode: 'currency', 
        percentages,           // Calculated percentages
        inputValues: updated   // The currency values user entered
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
    const newDistribution: Record<string, number> = {}
    Object.entries(localDistribution).forEach(([item, value]) => {
      newDistribution[item] = totalBudget > 0 ? (value / totalBudget) * 100 : 0
    })
    setLocalDistribution(newDistribution)
    
    // Always return nominal values as primary
    const nominalDistribution: Record<string, number> = {}
    Object.entries(newDistribution).forEach(([key, percentValue]) => {
      nominalDistribution[key] = (percentValue / 100) * totalBudget
    })
    onChange(nominalDistribution, { 
      mode: 'percentage', 
      percentages: newDistribution,
      inputValues: newDistribution
    })
    
    setMode('percentage')
    onModeChange?.('percentage')
  }

  const convertToCurrency = () => {
    const newDistribution: Record<string, number> = {}
    Object.entries(localDistribution).forEach(([item, value]) => {
      newDistribution[item] = (value / 100) * totalBudget
    })
    setLocalDistribution(newDistribution)
    
    // Always return nominal values as primary
    const percentages: Record<string, number> = {}
    Object.entries(newDistribution).forEach(([key, currencyValue]) => {
      percentages[key] = totalBudget > 0 ? (currencyValue / totalBudget) * 100 : 0
    })
    onChange(newDistribution, { 
      mode: 'currency', 
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
