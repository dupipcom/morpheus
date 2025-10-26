'use client'

import React, { useMemo, useState, useEffect, useContext, useCallback } from 'react'

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { DoToolbar } from '@/views/doToolbar'
import { Badge } from '@/components/ui/badge'
import { User as UserIcon } from 'lucide-react'

import { GlobalContext } from '@/lib/contexts'
import { useI18n } from '@/lib/contexts/i18n'
import { getWeekNumber } from '@/app/helpers'

export const ListView = () => {
  const { session, taskLists, refreshTaskLists } = useContext(GlobalContext)
  const { t, locale } = useI18n()

  const today = new Date()
  const date = today.toISOString().split('T')[0]
  const year = Number(date.split('-')[0])
  const allTaskLists = taskLists || []

  const [selectedTaskListId, setSelectedTaskListId] = useState<string | undefined>(allTaskLists[0]?.id)
  useEffect(() => {
    if (!selectedTaskListId && allTaskLists.length > 0) setSelectedTaskListId(allTaskLists[0].id)
  }, [allTaskLists, selectedTaskListId])

  const selectedTaskList = useMemo(() => allTaskLists.find((l:any) => l.id === selectedTaskListId), [allTaskLists, selectedTaskListId])

  // Collaborator profiles map (userId -> userName)
  const [collabProfiles, setCollabProfiles] = useState<Record<string, string>>({})
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        const ids: string[] = Array.isArray((selectedTaskList as any)?.collaborators) ? (selectedTaskList as any).collaborators : []
        if (!ids.length) { setCollabProfiles({}); return }
        const res = await fetch(`/api/v1/profiles/by-ids?ids=${encodeURIComponent(ids.join(','))}`)
        if (!cancelled && res.ok) {
          const data = await res.json()
          const map: Record<string, string> = {}
          ;(data.profiles || []).forEach((p: any) => { map[p.userId] = p.userName || p.userId })
          setCollabProfiles(map)
        }
      } catch {}
    }
    run()
    return () => { cancelled = true }
  }, [selectedTaskList?.id, JSON.stringify((selectedTaskList as any)?.collaborators || [])])

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
      return { ...t, status: doneCount >= (times || 1) ? 'Done' : 'Open', count: Math.min(doneCount || 0, times || 1), completers: completed?.completers }
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

  // Sort tasks: incomplete first, then completed. Use current toggles as well.
  const sortedMergedTasks = useMemo(() => {
    const isDone = (t:any) => (t?.status === 'Done') || values.includes(t?.name)
    return [...mergedTasks].sort((a:any, b:any) => {
      const aDone = isDone(a)
      const bDone = isDone(b)
      if (aDone === bDone) return 0
      return aDone ? 1 : -1
    })
  }, [mergedTasks, values])

  const handleAddEphemeral = useCallback(async () => {
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
    await refreshTaskLists()
  }, [selectedTaskList, refreshTaskLists])

  const refreshLists = useCallback(async () => { await refreshTaskLists() }, [refreshTaskLists])

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
      if ((c.count || 0) > 0 && c.status !== 'Done') {
        c.status = 'Open'
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

    // If this is a weekly list, also persist tasks under user.entries[year].weeks[weekNumber].tasks
    try {
      const isWeekly = typeof (selectedTaskList as any)?.role === 'string' && (selectedTaskList as any).role.startsWith('weekly')
      if (isWeekly) {
        const doneForWeek = nextActions.filter((a:any) => a?.status === 'Done')
        if (doneForWeek.length > 0) {
          const week = getWeekNumber(today)[1]
          await fetch('/api/v1/user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ weekTasksAppend: doneForWeek, week, date, listRole: (selectedTaskList as any)?.role })
          })
        }
      }
    } catch {}

    // Always append all Done tasks to user.entries[year].days[date].tasks
    try {
      const doneForDay = nextActions.filter((a:any) => a?.status === 'Done')
      if (doneForDay.length > 0) {
        await fetch('/api/v1/user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dayTasksAppend: doneForDay, date, listRole: (selectedTaskList as any)?.role })
        })
      }
    } catch {}

    await refreshTaskLists()
  }

  console.log("LISTVIEW", { selectedTaskListId, selectedTaskList, allTaskLists })

  if (!selectedTaskListId) return null
  return (
    <div className="space-y-4">
      <DoToolbar
        locale={locale}
        selectedTaskListId={selectedTaskListId}
        onChangeSelectedTaskListId={setSelectedTaskListId}
        onAddEphemeral={handleAddEphemeral}
      />

      <ToggleGroup
        value={values}
        onValueChange={handleToggleChange}
        variant="outline"
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 align-center justify-center w-full m-auto"
        type="multiple"
        orientation="horizontal"
      >
        {sortedMergedTasks.map((task:any) => {
          const isDone = (task?.status === 'Done') || values.includes(task?.name)
          const lastCompleter = Array.isArray(task?.completers) && task.completers.length > 0 ? task.completers[task.completers.length - 1] : undefined
          const isCollabCompleter = lastCompleter && Array.isArray((selectedTaskList as any)?.collaborators) && (selectedTaskList as any).collaborators.includes(lastCompleter.id)
          const completerName = lastCompleter ? (collabProfiles[lastCompleter.id] || lastCompleter.id) : ''
          return (
            <div key={`task__item--${task.name}`} className="flex flex-col items-center m-1">
              <div className="relative w-full">
                <ToggleGroupItem className="rounded-md leading-7 text-sm min-h-[40px] truncate w-full" value={task.name} aria-label={task.name}>
                  {task.times > 1 ? `${task.count || 0}/${task.times} ` : ''}{task.displayName || task.name}
                </ToggleGroupItem>
              </div>
              {isDone && isCollabCompleter && completerName && (
                <div className="mt-1">
                  <Badge variant="secondary" className="bg-muted text-muted-foreground border-muted">
                    <UserIcon className="h-3 w-3 mr-1" />
                    Completed by {completerName}
                  </Badge>
                </div>
              )}
            </div>
          )
        })}
      </ToggleGroup>
    </div>
  )
}


