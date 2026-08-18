'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { useI18n } from '@/lib/contexts/i18n'
import { jsonFetcher } from '@/lib/utils/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'

interface LedgerEntryData {
  id: string
  direction: 'DEBIT' | 'CREDIT'
  amount: number
  balanceAfter: number
  createdAt: string
}

interface StatementData {
  wallet: { id: string; balance: number; pendingBalance: number }
  entries: LedgerEntryData[]
  nextCursor: string | null
}

/**
 * Balance + pending + statement surface (Phase 6). Reads the off-chain ledger
 * via GET /api/v1/wallet/[walletId]/statement (cursor paginated, newest first).
 */
export const WalletBalanceCard = ({ walletId }: { walletId: string }) => {
  const { t } = useI18n()
  const [showStatement, setShowStatement] = useState(false)

  const { data, isLoading } = useSWR<StatementData>(
    showStatement ? `/api/v1/wallet/${walletId}/statement?limit=20` : null,
    jsonFetcher,
    { revalidateOnFocus: false }
  )

  if (isLoading) {
    return (
      <div className="space-y-2 border rounded-lg p-4">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-4 w-24" />
      </div>
    )
  }

  const wallet = data?.wallet
  const entries = data?.entries || []

  return (
    <div className="space-y-3 border rounded-lg p-4 bg-muted/50">
      <h3 className="text-lg font-semibold">
        {t('wallet.balanceTitle', { defaultValue: 'DPIP balance' })}
      </h3>

      <div className="flex gap-6">
        <div>
          <p className="text-2xl font-bold">DPIP {((wallet?.balance ?? 0) / 100).toFixed(2)}</p>
          <p className="text-xs text-muted-foreground">
            {t('wallet.available', { defaultValue: 'Available' })}
          </p>
        </div>
        {(wallet?.pendingBalance ?? 0) > 0 && (
          <div>
            <p className="text-2xl font-bold text-muted-foreground">
              DPIP {((wallet?.pendingBalance ?? 0) / 100).toFixed(2)}
            </p>
            <p className="text-xs text-muted-foreground">
              {t('wallet.pending', { defaultValue: 'Pending (held)' })}
            </p>
          </div>
        )}
      </div>

      <Button variant="outline" size="sm" onClick={() => setShowStatement((prev) => !prev)}>
        {showStatement
          ? t('wallet.hideStatement', { defaultValue: 'Hide statement' })
          : t('wallet.showStatement', { defaultValue: 'Show statement' })}
      </Button>

      {showStatement && entries.length > 0 && (
        <ul className="space-y-1 max-h-64 overflow-y-auto text-sm">
          {entries.map((entry) => (
            <li key={entry.id} className="flex justify-between gap-2 border-b pb-1">
              <span className={entry.direction === 'CREDIT' ? 'text-green-600' : 'text-red-600'}>
                {entry.direction === 'CREDIT' ? '+' : '−'} {(entry.amount / 100).toFixed(2)}
              </span>
              <span className="text-muted-foreground">
                {new Date(entry.createdAt).toLocaleDateString()}
              </span>
              <span>{(entry.balanceAfter / 100).toFixed(2)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
