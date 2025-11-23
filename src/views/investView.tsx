'use client'

import React from 'react'
import { AlertTriangle } from 'lucide-react'
import { useI18n } from '@/lib/contexts/i18n'
import { ViewMenu } from '@/components/viewMenu'
import { BalanceSection } from '@/components/balanceSection'
import { WalletManager } from '@/components/walletManager'
import { NFTGenerator } from '@/components/nftGenerator'
import { TokenTransfer } from '@/components/tokenTransfer'

export const InvestView = () => {
  const { t } = useI18n()
  
  return (
    <main className="">
      <div className="container mx-auto px-4 py-6 max-w-4xl space-y-6">
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
          <p className="text-sm text-destructive break-words">
            {t('invest.notice')}
          </p>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-4">
            <WalletManager />
          </div>
          <div className="space-y-4">
            <TokenTransfer />
            <NFTGenerator />
          </div>
        </div>
      </div>
    </main>
  )
}

