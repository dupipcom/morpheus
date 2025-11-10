'use client'

import React from 'react'
import { ViewMenu } from '@/components/viewMenu'
import { BalanceSection } from '@/components/balance-section'
import { Construction, FileWarningIcon, WorkflowIcon } from 'lucide-react'

export const InvestView = () => {
  return (
    <main className="">
      <div className="container mx-auto px-4 py-6 max-w-4xl sticky top-[115px] z-50">
        <div className="flex items-center justify-center">
          <Construction className="h-32 w-32 text-muted-foreground" />
        </div>
      </div>
    </main>
  )
}

