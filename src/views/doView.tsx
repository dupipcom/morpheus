'use client'

import React from 'react'

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


