'use client'

import React from 'react'
import { useContext, useEffect, useRef } from 'react'
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

export const DoView = () => {
  const { refreshTaskLists, taskLists } = useContext(GlobalContext)
  const fetchedRef = useRef(false)

  useEffect(() => {
    if (fetchedRef.current) return
    fetchedRef.current = true
    if (!Array.isArray(taskLists) || taskLists.length === 0) {
      refreshTaskLists()
    }
  }, [refreshTaskLists, taskLists])

  // Refresh task lists every 10 seconds
  useEffect(() => {
    const id = setInterval(() => {
      refreshTaskLists()
    }, 10000)
    return () => clearInterval(id)
  }, [refreshTaskLists])

  return (
    <main className="min-h-[100vh]">
      <ViewMenu active="do" />
      <div className="container mx-auto px-4 py-6">
        <Accordion type="multiple" className="w-full">
          <AccordionItem value="mood">
            <AccordionTrigger>Mood</AccordionTrigger>
            <AccordionContent>
              <MoodView timeframe="day" />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="list">
            <AccordionTrigger>Tasks</AccordionTrigger>
            <AccordionContent>
              <ListView />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </main>
  )
}


