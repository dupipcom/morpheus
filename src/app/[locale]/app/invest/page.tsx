'use client'

import React from 'react'
import { InvestView } from '@/views/investView'
import { ViewMenu } from '@/components/viewMenu'
import { PublishNote } from '@/components/publish-note'
import { BalanceSection } from '@/components/balance-section'

export const dynamic = 'force-dynamic'

export default function LocalizedInvest({ params }: { params: Promise<{ locale: string }> }) {
  return <main className="">
    <div className="w-full max-w-[1200px] m-auto px-4 sticky top-[115px] z-70">
      <BalanceSection />
    </div>
  <ViewMenu active="invest" />
  <div className="container mx-auto px-4 py-6">
    <InvestView timeframe="day" />
  </div>
</main>
}

