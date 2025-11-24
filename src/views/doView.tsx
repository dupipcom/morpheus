'use client'

import React from 'react'
import { useContext, useEffect, useRef, useState, useMemo } from 'react'
import { GlobalContext } from '@/lib/contexts'
import { AddTaskForm } from '@/views/forms/addTaskForm'
import { AddListForm } from '@/views/forms/addListForm'
import { AddTemplateForm } from '@/views/forms/addTemplateForm'

import { ViewMenu } from '@/components/viewMenu'
import { MoodView } from '@/views/moodView'
import { ListView } from './listView'

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'

export const DoView = ({
  selectedTaskListId,
  selectedDate,
  onDateChange,
  onAddEphemeral,
  showAddTask,
  showAddList,
  showAddTemplate,
  isEditingList,
  onCloseAddTask,
  onCloseAddList,
  onCloseAddTemplate,
  onTaskCreated,
  onListCreated,
  onTemplateCreated,
}: {
  selectedTaskListId?: string
  selectedDate?: Date
  onDateChange?: (date: Date | undefined) => void
  onAddEphemeral?: () => Promise<void> | void
  showAddTask?: boolean
  showAddList?: boolean
  showAddTemplate?: boolean
  isEditingList?: boolean
  onCloseAddTask?: () => void
  onCloseAddList?: () => void
  onCloseAddTemplate?: () => void
  onTaskCreated?: () => Promise<void> | void
  onListCreated?: (newListId?: string) => Promise<void> | void
  onTemplateCreated?: () => Promise<void> | void
}) => {
  const { refreshTaskLists, taskLists: contextTaskLists, session } = useContext(GlobalContext)
  const [stableTaskLists, setStableTaskLists] = useState<any[]>([])
  const [userTemplates, setUserTemplates] = useState<any[]>([])
  const initialFetchDone = useRef(false)

  // Fetch immediately on mount
  useEffect(() => {
    if (!initialFetchDone.current) {
      initialFetchDone.current = true
      refreshTaskLists()
    }
  }, [refreshTaskLists])

  // Update stable state only when context has valid data (never clear once we have data)
  useEffect(() => {
    if (Array.isArray(contextTaskLists) && contextTaskLists.length > 0) {
      setStableTaskLists(contextTaskLists)
    }
  }, [contextTaskLists])

  // Refresh task lists every 30 seconds
  useEffect(() => {
    const id = setInterval(() => {
      refreshTaskLists()
    }, 30000)
    return () => clearInterval(id)
  }, [refreshTaskLists])

  // Fetch templates
  const refreshTemplates = async () => {
    try {
      const res = await fetch('/api/v1/templates')
      if (res.ok) {
        const data = await res.json()
        setUserTemplates(data.templates || [])
      }
    } catch {}
  }

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      if (cancelled) return
      await refreshTemplates()
    }
    run()
    return () => { cancelled = true }
  }, [])

  const allTaskLists = useMemo(() => 
    (stableTaskLists.length > 0 ? stableTaskLists : (Array.isArray(contextTaskLists) ? contextTaskLists : [])) as any[],
    [stableTaskLists, contextTaskLists]
  )
  const selectedList = useMemo(() => {
    const found = allTaskLists.find((l:any) => l.id === selectedTaskListId)
    return found
  }, [allTaskLists, selectedTaskListId])

  // Determine if all mood sliders for today are zero (or unset)
  const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const today = new Date()
  const todayDate = today.toLocaleString('en-uk', { timeZone: userTimezone }).split(',')[0].split('/').reverse().join('-')
  const year = Number(todayDate.split('-')[0])
  const todayMood = ((session as any)?.user?.entries?.[year]?.days?.[todayDate]?.mood) || {}
  const moodKeys = ['gratitude','optimism','restedness','tolerance','selfEsteem','trust'] as const
  const allMoodZero = moodKeys.every((k) => Number((todayMood as any)[k] ?? 0) === 0)

  // Controlled accordion open state, default to opening mood if all zero
  const [openItems, setOpenItems] = useState<string[]>(allMoodZero ? ['mood'] : ['list'])

  // If session loads later and nothing is open yet, open mood once when condition is met
  useEffect(() => {
    if (openItems.length === 0) {
      const currentMood = ((session as any)?.user?.entries?.[year]?.days?.[todayDate]?.mood) || {}
      const shouldOpenMood = moodKeys.every((k) => Number((currentMood as any)[k] ?? 0) === 0)
      setOpenItems(shouldOpenMood ? ['mood'] : ['list'])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session])

  return (
    <>
      {showAddTask && (
        <div className="mb-4">
          <AddTaskForm
            selectedTaskListId={selectedTaskListId}
            onCancel={onCloseAddTask || (() => {})}
            onCreated={async () => {
              if (onTaskCreated) await onTaskCreated()
              if (onCloseAddTask) onCloseAddTask()
            }}
          />
        </div>
      )}

      {showAddList && (
        <div className="mb-4">
          <AddListForm
            allTaskLists={allTaskLists}
            userTemplates={userTemplates}
            isEditing={isEditingList || false}
            initialList={isEditingList ? (selectedList as any) : undefined}
            onCancel={onCloseAddList || (() => {})}
            onCreated={async (newListId) => {
              if (onListCreated) await onListCreated(newListId)
              if (onCloseAddList) onCloseAddList()
            }}
          />
        </div>
      )}

      {showAddTemplate && (
        <div className="mb-4">
          <AddTemplateForm
            allTaskLists={allTaskLists}
            onCancel={onCloseAddTemplate || (() => {})}
            onCreated={async () => {
              await refreshTemplates()
              if (onTemplateCreated) await onTemplateCreated()
              if (onCloseAddTemplate) onCloseAddTemplate()
            }}
          />
        </div>
      )}

      <ListView 
        selectedTaskListId={selectedTaskListId}
        selectedDate={selectedDate}
        onDateChange={onDateChange}
        onAddEphemeral={onAddEphemeral}
      />
    </>
  )
}


