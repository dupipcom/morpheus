'use client'

import React from 'react'
import { useContext, useEffect, useRef, useState } from 'react'
import { GlobalContext } from '@/lib/contexts'

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
}: {
  selectedTaskListId?: string
  selectedDate?: Date
  onDateChange?: (date: Date | undefined) => void
  onAddEphemeral?: () => Promise<void> | void
}) => {
  const { refreshTaskLists, taskLists: contextTaskLists, session } = useContext(GlobalContext)
  const [stableTaskLists, setStableTaskLists] = useState<any[]>([])
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

  // Refresh task lists every 10 seconds
  useEffect(() => {
    const id = setInterval(() => {
      refreshTaskLists()
    }, 10000)
    return () => clearInterval(id)
  }, [refreshTaskLists])

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
    <ListView 
      selectedTaskListId={selectedTaskListId}
      selectedDate={selectedDate}
      onDateChange={onDateChange}
      onAddEphemeral={onAddEphemeral}
    />
  )
}


