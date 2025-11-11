'use client'

import React from 'react'

import { ViewMenu } from '@/components/viewMenu'
import { MoodView } from '@/views/moodView'
import { PublishNote } from '@/components/publish-note'

export const dynamic = 'force-dynamic'

export default function LocalizedFeel({ params }: { params: Promise<{ locale: string }> }) {
  return (
    <main className="min-h-[100vh]">
      <ViewMenu active="feel">
        <PublishNote />
      </ViewMenu>
      <div className="container mx-auto px-4 py-6">
        <MoodView timeframe="day" />
      </div>
    </main>
  )
}


