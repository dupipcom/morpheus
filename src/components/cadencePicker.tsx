'use client'

import React, { useMemo, useState, useEffect } from 'react'
import { RRule, Weekday, rrulestr } from 'rrule'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/contexts/i18n'

const WEEKDAYS: Array<{ value: number; label: string }> = [
  { value: RRule.MO.weekday, label: 'Mon' },
  { value: RRule.TU.weekday, label: 'Tue' },
  { value: RRule.WE.weekday, label: 'Wed' },
  { value: RRule.TH.weekday, label: 'Thu' },
  { value: RRule.FR.weekday, label: 'Fri' },
  { value: RRule.SA.weekday, label: 'Sat' },
  { value: RRule.SU.weekday, label: 'Sun' },
]

const ORDINALS: Array<{ value: number; label: string }> = [
  { value: 1, label: 'First' },
  { value: 2, label: 'Second' },
  { value: 3, label: 'Third' },
  { value: 4, label: 'Fourth' },
  { value: -1, label: 'Last' },
]

type Frequency = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly'
type EndMode = 'never' | 'after' | 'on'

interface CadenceState {
  frequency: Frequency
  interval: number
  weekdays: number[]
  monthMode: 'day' | 'nth'
  monthDay: number
  ordinal: number
  ordinalWeekday: number
  yearMonth: number
  endMode: EndMode
  endCount: number
  endDate: string
}

const DEFAULT_STATE: CadenceState = {
  frequency: 'none',
  interval: 1,
  weekdays: [],
  monthMode: 'day',
  monthDay: 1,
  ordinal: 1,
  ordinalWeekday: RRule.MO.weekday,
  yearMonth: 1,
  endMode: 'never',
  endCount: 10,
  endDate: '',
}

function buildRuleFromState(state: CadenceState): string | null {
  if (state.frequency === 'none') return null

  const options: Record<string, unknown> = {
    freq: state.frequency === 'daily' ? RRule.DAILY
      : state.frequency === 'weekly' ? RRule.WEEKLY
      : state.frequency === 'monthly' ? RRule.MONTHLY
      : RRule.YEARLY,
    interval: Math.max(1, state.interval) || 1,
  }

  if (state.frequency === 'weekly' && state.weekdays.length > 0) {
    options.byweekday = state.weekdays
  }
  if (state.frequency === 'monthly') {
    if (state.monthMode === 'day') {
      options.bymonthday = [Math.min(31, Math.max(1, state.monthDay))]
    } else {
      // Nth-weekday rules must use byweekday with a Weekday that carries `n`
      // (serializes to BYDAY=+1MO). The internal `bynweekday` option is not
      // RFC 5545 and produces an RRULE that rrulestr() cannot parse back.
      options.byweekday = [new Weekday(state.ordinalWeekday, state.ordinal)]
    }
  }
  if (state.frequency === 'yearly') {
    options.bymonth = [Math.min(12, Math.max(1, state.yearMonth))]
  }
  if (state.endMode === 'after') {
    options.count = Math.max(1, state.endCount)
  } else if (state.endMode === 'on' && state.endDate) {
    options.until = new Date(`${state.endDate}T00:00:00Z`)
  }

  return new RRule(options as never).toString()
}

interface CadencePickerProps {
  value: string | null
  onChange: (rrule: string | null) => void
}

/**
 * Google-Calendar-like repetition picker.
 * Emits an RFC-5545 RRULE string (or null for one-off tasks).
 */
export const CadencePicker = ({ value, onChange }: CadencePickerProps) => {
  const { t } = useI18n()
  const [state, setState] = useState<CadenceState>(DEFAULT_STATE)

  // Parse the incoming RRULE string back into picker state (best effort)
  useEffect(() => {
    if (!value) {
      setState(DEFAULT_STATE)
      return
    }
    try {
      const rule = rrulestr(value)
      const freqMap: Record<number, Frequency> = {
        [RRule.DAILY]: 'daily',
        [RRule.WEEKLY]: 'weekly',
        [RRule.MONTHLY]: 'monthly',
        [RRule.YEARLY]: 'yearly',
      }
      const next: CadenceState = { ...DEFAULT_STATE }
      next.frequency = freqMap[rule.options.freq] || 'none'
      next.interval = rule.options.interval || 1
      // Weekday backfill only when the rule explicitly carries BYDAY: legacy
      // "FREQ=WEEKLY" rules default to Monday inside the lib, but showing that
      // default as a selected weekday would silently rewrite the task's cadence
      // on save (the everyday legacy behavior must stay opt-out-able).
      const hasByday = /BYDAY=/i.test(value)
      if (hasByday && Array.isArray(rule.options.byweekday) && rule.options.byweekday.length > 0) {
        next.weekdays = rule.options.byweekday as number[]
      } else if (hasByday && Array.isArray(rule.origOptions.byweekday) && rule.origOptions.byweekday.length > 0) {
        // Nth-weekday rules (BYDAY=+1MO): the lib keeps these Weekday
        // instances in origOptions and leaves options.byweekday null.
        const first = rule.origOptions.byweekday[0] as { weekday: number; n?: number }
        if (typeof first.n === 'number' && first.n !== 0) {
          next.monthMode = 'nth'
          next.ordinal = first.n
          next.ordinalWeekday = first.weekday
        }
      }
      if (Array.isArray(rule.options.bymonthday) && rule.options.bymonthday.length > 0) {
        next.monthMode = 'day'
        next.monthDay = rule.options.bymonthday[0] as number
      }
      if (Array.isArray(rule.options.bymonth) && rule.options.bymonth.length > 0) {
        next.yearMonth = rule.options.bymonth[0] as number
      }
      if (rule.options.count) {
        next.endMode = 'after'
        next.endCount = rule.options.count as number
      } else if (rule.options.until) {
        next.endMode = 'on'
        next.endDate = rule.options.until.toISOString().slice(0, 10)
      } else {
        next.endMode = 'never'
      }
      setState(next)
    } catch {
      setState(DEFAULT_STATE)
    }
  }, [value])

  // Update state AND emit the resulting rule in one place (no stale state)
  const update = (patch: Partial<CadenceState>) => {
    setState((prev) => {
      const next = { ...prev, ...patch }
      onChange(buildRuleFromState(next))
      return next
    })
  }

  const toggleWeekday = (wd: number) => {
    const next = state.weekdays.includes(wd)
      ? state.weekdays.filter((w) => w !== wd)
      : [...state.weekdays, wd].sort()
    update({ weekdays: next })
  }

  // Human-readable summary of the current rule
  const summary = useMemo(() => {
    if (state.frequency === 'none') return t('forms.addTaskForm.cadence.none', { defaultValue: 'Does not repeat' })
    const unit = state.frequency === 'daily'
      ? (state.interval === 1 ? t('forms.addTaskForm.cadence.day', { defaultValue: 'day' }) : t('forms.addTaskForm.cadence.days', { defaultValue: 'days' }))
      : state.frequency === 'weekly'
        ? (state.interval === 1 ? t('forms.addTaskForm.cadence.week', { defaultValue: 'week' }) : t('forms.addTaskForm.cadence.weeks', { defaultValue: 'weeks' }))
        : state.frequency === 'monthly'
          ? (state.interval === 1 ? t('forms.addTaskForm.cadence.month', { defaultValue: 'month' }) : t('forms.addTaskForm.cadence.months', { defaultValue: 'months' }))
          : state.interval === 1 ? t('forms.addTaskForm.cadence.year', { defaultValue: 'year' }) : t('forms.addTaskForm.cadence.years', { defaultValue: 'years' })
    const every = `${t('forms.addTaskForm.cadence.every', { defaultValue: 'Every' })} ${state.interval} ${unit}`
    if (state.frequency === 'weekly' && state.weekdays.length > 0) {
      const labels = state.weekdays.map((wd) => WEEKDAYS.find((w) => w.value === wd)?.label).filter(Boolean)
      return `${every} (${labels.join(', ')})`
    }
    if (state.frequency === 'monthly' && state.monthMode === 'nth') {
      const ordinalLabel = ORDINALS.find((o) => o.value === state.ordinal)?.label || ''
      const dayLabel = WEEKDAYS.find((w) => w.value === state.ordinalWeekday)?.label || ''
      return `${every} (${ordinalLabel} ${dayLabel})`
    }
    return every
  }, [state, t])

  return (
    <div className="space-y-2">
      <Label>{t('forms.addTaskForm.cadenceLabel', { defaultValue: 'Repeats' })}</Label>
      <Select
        value={state.frequency}
        onValueChange={(val) => {
          const freq = val as Frequency
          // Default weekly selections to Monday so the rule is valid immediately
          const patch: Partial<CadenceState> = { frequency: freq }
          if (freq === 'weekly' && state.weekdays.length === 0) {
            patch.weekdays = [RRule.MO.weekday]
          }
          update(patch)
        }}
      >
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">{t('forms.addTaskForm.cadence.none', { defaultValue: 'Does not repeat' })}</SelectItem>
          <SelectItem value="daily">{t('forms.addTaskForm.cadence.daily', { defaultValue: 'Daily' })}</SelectItem>
          <SelectItem value="weekly">{t('forms.addTaskForm.cadence.weekly', { defaultValue: 'Weekly' })}</SelectItem>
          <SelectItem value="monthly">{t('forms.addTaskForm.cadence.monthly', { defaultValue: 'Monthly' })}</SelectItem>
          <SelectItem value="yearly">{t('forms.addTaskForm.cadence.yearly', { defaultValue: 'Yearly' })}</SelectItem>
        </SelectContent>
      </Select>

      {state.frequency !== 'none' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{t('forms.addTaskForm.cadence.every', { defaultValue: 'Every' })}</span>
            <Input
              type="number"
              min={1}
              className="w-20"
              value={state.interval}
              onChange={(e) => update({ interval: Math.max(1, Number(e.target.value) || 1) })}
            />
            <span className="text-sm text-muted-foreground">
              {state.frequency === 'daily' ? t('forms.addTaskForm.cadence.days', { defaultValue: 'days' })
                : state.frequency === 'weekly' ? t('forms.addTaskForm.cadence.weeks', { defaultValue: 'weeks' })
                : state.frequency === 'monthly' ? t('forms.addTaskForm.cadence.months', { defaultValue: 'months' })
                : t('forms.addTaskForm.cadence.years', { defaultValue: 'years' })}
            </span>
          </div>

          {state.frequency === 'weekly' && (
            <div className="flex flex-wrap gap-1">
              {WEEKDAYS.map((wd) => (
                <Button
                  key={wd.value}
                  type="button"
                  size="sm"
                  variant={state.weekdays.includes(wd.value) ? 'default' : 'outline'}
                  onClick={() => toggleWeekday(wd.value)}
                >
                  {wd.label}
                </Button>
              ))}
            </div>
          )}

          {state.frequency === 'monthly' && (
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={state.monthMode} onValueChange={(val) => update({ monthMode: val as 'day' | 'nth' })}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">{t('forms.addTaskForm.cadence.onDay', { defaultValue: 'On day' })}</SelectItem>
                  <SelectItem value="nth">{t('forms.addTaskForm.cadence.onThe', { defaultValue: 'On the' })}</SelectItem>
                </SelectContent>
              </Select>
              {state.monthMode === 'day' ? (
                <Input
                  type="number"
                  min={1}
                  max={31}
                  className="w-20"
                  value={state.monthDay}
                  onChange={(e) => update({ monthDay: Math.min(31, Math.max(1, Number(e.target.value) || 1)) })}
                />
              ) : (
                <>
                  <Select value={String(state.ordinal)} onValueChange={(val) => update({ ordinal: Number(val) })}>
                    <SelectTrigger className="w-[120px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ORDINALS.map((o) => (
                        <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={String(state.ordinalWeekday)} onValueChange={(val) => update({ ordinalWeekday: Number(val) })}>
                    <SelectTrigger className="w-[100px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {WEEKDAYS.map((wd) => (
                        <SelectItem key={wd.value} value={String(wd.value)}>{wd.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </>
              )}
            </div>
          )}

          {state.frequency === 'yearly' && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{t('forms.addTaskForm.cadence.inMonth', { defaultValue: 'In month' })}</span>
              <Select value={String(state.yearMonth)} onValueChange={(val) => update({ yearMonth: Number(val) })}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <SelectItem key={m} value={String(m)}>{new Date(2026, m - 1, 1).toLocaleString('en-US', { month: 'long' })}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-muted-foreground">{t('forms.addTaskForm.cadence.ends', { defaultValue: 'Ends' })}</span>
            <Select value={state.endMode} onValueChange={(val) => update({ endMode: val as EndMode })}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="never">{t('forms.addTaskForm.cadence.never', { defaultValue: 'Never' })}</SelectItem>
                <SelectItem value="after">{t('forms.addTaskForm.cadence.after', { defaultValue: 'After' })}</SelectItem>
                <SelectItem value="on">{t('forms.addTaskForm.cadence.onDate', { defaultValue: 'On date' })}</SelectItem>
              </SelectContent>
            </Select>
            {state.endMode === 'after' && (
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  min={1}
                  className="w-20"
                  value={state.endCount}
                  onChange={(e) => update({ endCount: Math.max(1, Number(e.target.value) || 1) })}
                />
                <span className="text-sm text-muted-foreground">{t('forms.addTaskForm.cadence.occurrences', { defaultValue: 'occurrences' })}</span>
              </div>
            )}
            {state.endMode === 'on' && (
              <Input
                type="date"
                className="w-[160px]"
                value={state.endDate}
                onChange={(e) => update({ endDate: e.target.value })}
              />
            )}
          </div>

          <p className="text-xs text-muted-foreground">{summary}</p>
        </div>
      )}
    </div>
  )
}
