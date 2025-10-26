'use client'

import React, { useMemo, useState, useEffect, useContext } from 'react'
import useSWR from 'swr'

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { DoToolbar } from '@/views/doToolbar'

import { GlobalContext } from '@/lib/contexts'
import { useI18n } from '@/lib/contexts/i18n'
import { getWeekNumber } from '@/app/helpers'

export const ListView = () => {
  const { session } = useContext(GlobalContext)
  const { t, locale } = useI18n()

  const today = new Date()
  const date = today.toISOString().split('T')[0]
  const year = Number(date.split('-')[0])

  const { data: listsData, mutate: mutateTaskLists } = useSWR('/api/v1/tasklists', async () => {
    const res = await fetch('/api/v1/tasklists')
    if (!res.ok) return { taskLists: [] }
    return res.json()
  })

  const allTaskLists = listsData?.taskLists || []

  const [selectedTaskListId, setSelectedTaskListId] = useState<string | undefined>(allTaskLists[0]?.id)
  useEffect(() => {
    if (!selectedTaskListId && allTaskLists.length > 0) setSelectedTaskListId(allTaskLists[0].id)
  }, [allTaskLists, selectedTaskListId])

  const selectedTaskList = useMemo(() => allTaskLists.find((l:any) => l.id === selectedTaskListId), [allTaskLists, selectedTaskListId])

  // Build tasks: templateTasks + ephemeralTasks.open, overlay completedTasks[year][date]
  const mergedTasks = useMemo(() => {
    const base = (selectedTaskList?.templateTasks && selectedTaskList.templateTasks.length > 0)
      ? selectedTaskList.templateTasks
      : (selectedTaskList?.tasks || [])

    const ephemerals = (selectedTaskList?.ephemeralTasks?.open || []).map((t:any) => ({ ...t, isEphemeral: true }))

    const completedForDay: any[] = (selectedTaskList as any)?.completedTasks?.[year]?.[date] || []
    const byKey: Record<string, any> = {}
    const keyOf = (t:any) => (t?.id || t?.localeKey || (typeof t?.name === 'string' ? t.name.toLowerCase() : ''))
    completedForDay.forEach((t:any) => { const k = keyOf(t); if (k) byKey[k] = t })

    const overlayed = base.map((t:any) => {
      const k = keyOf(t)
      const completed = k ? byKey[k] : undefined
      if (!completed) return t
      const doneCount = Array.isArray(completed?.completers) ? completed.completers.length : Number(completed?.count || 0)
      const times = Number(t?.times || completed?.times || 1)
      return { ...t, status: doneCount >= (times || 1) ? 'Done' : 'Open', count: Math.min(doneCount || 0, times || 1) }
    })

    // Dedup ephemeral by name against base
    const names = new Set(overlayed.map((t:any) => t.name))
    const dedupEphemeral = ephemerals.filter((t:any) => !names.has(t.name))
    return [...overlayed, ...dedupEphemeral]
  }, [selectedTaskList, year, date])

  const doneNames = useMemo(() => mergedTasks.filter((t:any) => t.status === 'Done').map((t:any) => t.name), [mergedTasks])
  const [values, setValues] = useState<string[]>(doneNames)
  const [prevValues, setPrevValues] = useState<string[]>(doneNames)
  useEffect(() => { setValues(doneNames); setPrevValues(doneNames) }, [doneNames])

  const handleToggleChange = async (newValues: string[]) => {
    setValues(newValues)
    const justCompleted = newValues.filter(v => !prevValues.includes(v))
    setPrevValues(newValues)

    if (!selectedTaskList) return

    // Split regular vs ephemerals based on mergedTasks
    const regular = mergedTasks.filter((t:any) => !t.isEphemeral)
    const ephemerals = mergedTasks.filter((t:any) => t.isEphemeral)

    // Prepare next actions for regular tasks
    const nextActions = regular.map((action:any) => {
      const c = { ...action }
      if (newValues.includes(action.name) && (action.times - (action.count || 0)) === 1) {
        c.count = (c.count || 0) + 1
        c.status = 'Done'
      } else if (newValues.includes(action.name) && (action.times - (action.count || 0)) >= 1) {
        c.count = (c.count || 0) + 1
      } else {
        if (!newValues.includes(action.name) && (c.times || 1) <= (c.count || 0)) {
          if ((c.count || 0) > 0) {
            c.count = (c.count || 0) - 1
            c.status = 'Open'
          }
        }
      }
      return c
    })

    // Persist: record completions into TaskList.completedTasks
    if (nextActions.length > 0) {
      await fetch('/api/v1/tasklists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recordCompletions: true,
          taskListId: selectedTaskList.id,
          dayActions: nextActions,
          date,
          justCompletedNames: justCompleted
        })
      })
    }

    // Handle ephemerals: move from open to closed when toggled done
    for (const eph of ephemerals) {
      const isNowDone = newValues.includes(eph.name)
      const wasDone = prevValues.includes(eph.name)
      if (isNowDone && !wasDone) {
        await fetch('/api/v1/tasklists', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            taskListId: selectedTaskList.id,
            ephemeralTasks: { close: { id: eph.id } }
          })
        })
      }
    }

    await mutateTaskLists()
  }

  return (
    <div className="space-y-4">
      <DoToolbar
        locale={locale}
        allTaskLists={allTaskLists}
        selectedTaskListId={selectedTaskListId}
        onChangeSelectedTaskListId={setSelectedTaskListId}
        onAddEphemeral={async () => {
          if (!selectedTaskList) return
          const name = prompt('New task name?')
          if (!name) return
          await fetch('/api/v1/tasklists', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              taskListId: selectedTaskList.id,
              ephemeralTasks: { add: { name, cadence: 'day' } }
            })
          })
          await mutateTaskLists()
        }}
        refreshLists={async () => { await mutateTaskLists() }}
      />

      <ToggleGroup
        value={values}
        onValueChange={handleToggleChange}
        variant="outline"
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 align-center justify-center w-full m-auto"
        type="multiple"
        orientation="horizontal"
      >
        {mergedTasks.map((task:any) => (
          <div key={`task__item--${task.name}`} className="flex flex-col items-center m-1">
            <div className="relative w-full">
              <ToggleGroupItem className="rounded-md leading-7 text-sm min-h-[40px] truncate w-full" value={task.name} aria-label={task.name}>
                {task.times > 1 ? `${task.count || 0}/${task.times} ` : ''}{task.displayName || task.name}
              </ToggleGroupItem>
            </div>
          </div>
        ))}
      </ToggleGroup>
    </div>
  )
}


