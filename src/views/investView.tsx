'use client'

import React from 'react'
import { ViewMenu } from '@/components/viewMenu'
import { BalanceSection } from '@/components/balance-section'
import { Construction, FileWarningIcon, WorkflowIcon } from 'lucide-react'

export const InvestView = () => {
  return (
    <main className="">
      <div className="container mx-auto px-4 py-6 max-w-4xl sticky top-[115px] z-50">
        <Construction className="h-16 w-16" />
      </div>
    </main>
  )
}

