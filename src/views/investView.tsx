'use client'

import React from 'react'
import { ViewMenu } from '@/components/viewMenu'
import { BalanceSection } from '@/components/balanceSection'
import { WalletManager } from '@/components/walletManager'
import { NFTGenerator } from '@/components/nftGenerator'
import { TokenTransfer } from '@/components/tokenTransfer'

export const InvestView = () => {
  return (
    <main className="">
      <div className="container mx-auto px-4 py-6 max-w-4xl space-y-6">
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

