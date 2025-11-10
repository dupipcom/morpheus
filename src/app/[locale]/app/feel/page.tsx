'use client'

import React from 'react'

import { ViewMenu } from '@/components/viewMenu'
import { MoodView } from '@/views/moodView'
import { PublishNote } from '@/components/publish-note'

export const dynamic = 'force-dynamic'

export default function LocalizedFeel({ params }: { params: Promise<{ locale: string }> }) {
  return (
    <main className="min-h-[100vh]">
      <ViewMenu active="feel" />
      <div className="w-full max-w-[1200px] m-auto px-4 sticky top-[115px] z-50">
        <PublishNote />
      </div>
      <div className="container mx-auto px-4 py-6">
        <MoodView timeframe="day" />
      </div>
    </main>
  )
}


