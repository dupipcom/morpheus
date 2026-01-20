'use client'

import React from 'react'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { useI18n } from '@/lib/contexts/i18n'

export interface RecurrenceRule {
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY' | 'NONE'
  interval: number
  byWeekday: number[]
  byMonthDay: number[]
  byMonth: number[]
  endDate?: Date | string | null
  occurrenceCount?: number | null
}

interface RecurrencePickerProps {
  value: RecurrenceRule | null
  onChange: (value: RecurrenceRule | null) => void
}

export const RecurrencePicker: React.FC<RecurrencePickerProps> = ({ value, onChange }) => {
  const { t } = useI18n()

  const frequency = value?.frequency || 'NONE'
  const interval = value?.interval || 1

  const handleFrequencyChange = (newFrequency: string) => {
    if (newFrequency === 'NONE') {
      onChange(null)
    } else {
      onChange({
        frequency: newFrequency as RecurrenceRule['frequency'],
        interval: value?.interval || 1,
        byWeekday: value?.byWeekday || [],
        byMonthDay: value?.byMonthDay || [],
        byMonth: value?.byMonth || [],
        endDate: value?.endDate || null,
        occurrenceCount: value?.occurrenceCount || null,
      })
    }
  }

  const handleIntervalChange = (newInterval: string) => {
    const intervalNum = Math.max(0, parseInt(newInterval, 10) || 0)
    if (value) {
      onChange({
        ...value,
        interval: intervalNum,
      })
    }
  }

  const getFrequencyLabel = (freq: string) => {
    switch (freq) {
      case 'DAILY':
        return interval === 1 ? 'day' : 'days'
      case 'WEEKLY':
        return interval === 1 ? 'week' : 'weeks'
      case 'MONTHLY':
        return interval === 1 ? 'month' : 'months'
      case 'YEARLY':
        return interval === 1 ? 'year' : 'years'
      default:
        return ''
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <Label htmlFor="recurrence-frequency">
          {t('forms.recurrencePicker.frequency') || 'Repeat'}
        </Label>
        <Select value={frequency} onValueChange={handleFrequencyChange}>
          <SelectTrigger className="w-full" id="recurrence-frequency">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="NONE">
              {t('forms.recurrencePicker.noRepeat') || 'Does not repeat'}
            </SelectItem>
            <SelectItem value="DAILY">
              {t('forms.recurrencePicker.daily') || 'Daily'}
            </SelectItem>
            <SelectItem value="WEEKLY">
              {t('forms.recurrencePicker.weekly') || 'Weekly'}
            </SelectItem>
            <SelectItem value="MONTHLY">
              {t('forms.recurrencePicker.monthly') || 'Monthly'}
            </SelectItem>
            <SelectItem value="YEARLY">
              {t('forms.recurrencePicker.yearly') || 'Yearly'}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {frequency !== 'NONE' && (
        <div className="flex items-center gap-2">
          <Label htmlFor="recurrence-interval" className="whitespace-nowrap">
            {t('forms.recurrencePicker.every') || 'Every'}
          </Label>
          <Input
            id="recurrence-interval"
            value={interval}
            onChange={(e) => handleIntervalChange(e.target.value)}
            className="w-20"
          />
          <span className="text-sm text-muted-foreground">
            {t(`forms.recurrencePicker.${getFrequencyLabel(frequency)}`) || getFrequencyLabel(frequency)}
          </span>
        </div>
      )}
    </div>
  )
}
