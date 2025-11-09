'use client'

import React from 'react'
import { ViewMenu } from '@/components/viewMenu'
import { BalanceSection } from '@/components/balance-section'

export const dynamic = 'force-dynamic'

export default function LocalizedInvest({ params }: { params: Promise<{ locale: string }> }) {
  return (
    <main className="min-h-[100vh]">
      <ViewMenu active="invest" />
      <div className="container mx-auto px-4 py-6 max-w-4xl">
        <BalanceSection />
      </div>
    </main>
  )
}

