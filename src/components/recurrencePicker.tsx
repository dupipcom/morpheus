'use client'

import React from 'react'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { Button } from '@/components/ui/button'
import { Calendar as CalendarIcon } from 'lucide-react'
import { useI18n } from '@/lib/contexts/i18n'
import { cn } from '@/lib/utils/utils'

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
  const byWeekday = value?.byWeekday || []
  const byMonthDay = value?.byMonthDay || []
  const endDate = value?.endDate
  const occurrenceCount = value?.occurrenceCount

  // Determine end condition type
  const endCondition = endDate
    ? 'onDate'
    : occurrenceCount
    ? 'afterOccurrences'
    : 'never'

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
    const intervalNum = Math.max(1, parseInt(newInterval, 10) || 1)
    if (value) {
      onChange({
        ...value,
        interval: intervalNum,
      })
    }
  }

  const handleWeekdayToggle = (weekday: number) => {
    if (!value) return

    const newByWeekday = byWeekday.includes(weekday)
      ? byWeekday.filter(d => d !== weekday)
      : [...byWeekday, weekday].sort((a, b) => a - b)

    onChange({
      ...value,
      byWeekday: newByWeekday,
    })
  }

  const handleMonthDayChange = (newMonthDay: string) => {
    if (!value) return

    const monthDayNum = parseInt(newMonthDay, 10)
    if (monthDayNum >= 1 && monthDayNum <= 31) {
      onChange({
        ...value,
        byMonthDay: [monthDayNum],
      })
    }
  }

  const handleEndConditionChange = (condition: string) => {
    if (!value) return

    switch (condition) {
      case 'never':
        onChange({
          ...value,
          endDate: null,
          occurrenceCount: null,
        })
        break
      case 'onDate':
        onChange({
          ...value,
          endDate: new Date(),
          occurrenceCount: null,
        })
        break
      case 'afterOccurrences':
        onChange({
          ...value,
          endDate: null,
          occurrenceCount: 1,
        })
        break
    }
  }

  const handleEndDateChange = (date: Date | undefined) => {
    if (!value || !date) return

    onChange({
      ...value,
      endDate: date,
      occurrenceCount: null,
    })
  }

  const handleOccurrenceCountChange = (count: string) => {
    if (!value) return

    const countNum = Math.max(1, parseInt(count, 10) || 1)
    onChange({
      ...value,
      endDate: null,
      occurrenceCount: countNum,
    })
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

  const weekdays = [
    { value: 1, label: 'Mon', key: 'monday' },
    { value: 2, label: 'Tue', key: 'tuesday' },
    { value: 3, label: 'Wed', key: 'wednesday' },
    { value: 4, label: 'Thu', key: 'thursday' },
    { value: 5, label: 'Fri', key: 'friday' },
    { value: 6, label: 'Sat', key: 'saturday' },
    { value: 7, label: 'Sun', key: 'sunday' },
  ]

  return (
    <div className="space-y-4">
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
        <>
          <div className="flex items-center gap-2">
            <Label htmlFor="recurrence-interval" className="whitespace-nowrap">
              {t('forms.recurrencePicker.every') || 'Every'}
            </Label>
            <Input
              type="number"
              min={1}
              id="recurrence-interval"
              value={interval}
              onChange={(e) => handleIntervalChange(e.target.value)}
              className="w-20"
            />
            <span className="text-sm text-muted-foreground">
              {t(`forms.recurrencePicker.${getFrequencyLabel(frequency)}`) || getFrequencyLabel(frequency)}
            </span>
          </div>

          {/* Weekday selection for WEEKLY frequency */}
          {frequency === 'WEEKLY' && (
            <div className="space-y-2">
              <Label>
                {t('forms.recurrencePicker.repeatOn') || 'Repeat on'}
              </Label>
              <div className="flex flex-wrap gap-2">
                {weekdays.map((day) => (
                  <div key={day.value} className="flex items-center space-x-2">
                    <Checkbox
                      id={`weekday-${day.value}`}
                      checked={byWeekday.includes(day.value)}
                      onCheckedChange={() => handleWeekdayToggle(day.value)}
                    />
                    <label
                      htmlFor={`weekday-${day.value}`}
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                    >
                      {t(`forms.recurrencePicker.${day.key}`) || day.label}
                    </label>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Month day selection for MONTHLY frequency */}
          {frequency === 'MONTHLY' && (
            <div className="space-y-2">
              <Label htmlFor="month-day">
                {t('forms.recurrencePicker.dayOfMonth') || 'Day of month'}
              </Label>
              <Input
                type="number"
                min={1}
                max={31}
                id="month-day"
                value={byMonthDay[0] || ''}
                onChange={(e) => handleMonthDayChange(e.target.value)}
                placeholder={t('forms.recurrencePicker.selectDay') || 'Select day (1-31)'}
                className="w-32"
              />
            </div>
          )}

          {/* End condition */}
          <div className="space-y-2">
            <Label htmlFor="end-condition">
              {t('forms.recurrencePicker.ends') || 'Ends'}
            </Label>
            <Select value={endCondition} onValueChange={handleEndConditionChange}>
              <SelectTrigger className="w-full" id="end-condition">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="never">
                  {t('forms.recurrencePicker.never') || 'Never'}
                </SelectItem>
                <SelectItem value="onDate">
                  {t('forms.recurrencePicker.onDate') || 'On date'}
                </SelectItem>
                <SelectItem value="afterOccurrences">
                  {t('forms.recurrencePicker.after') || 'After'}
                </SelectItem>
              </SelectContent>
            </Select>

            {/* Date picker for "On date" */}
            {endCondition === 'onDate' && endDate && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal',
                      !endDate && 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {endDate
                      ? new Date(endDate).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })
                      : t('forms.recurrencePicker.pickDate') || 'Pick a date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={new Date(endDate)}
                    onSelect={handleEndDateChange}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            )}

            {/* Occurrence count for "After N occurrences" */}
            {endCondition === 'afterOccurrences' && (
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  value={occurrenceCount || 1}
                  onChange={(e) => handleOccurrenceCountChange(e.target.value)}
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">
                  {t('forms.recurrencePicker.occurrences') || 'occurrences'}
                </span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
