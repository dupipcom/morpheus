'use client'

import { useState, useEffect } from 'react'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Send } from "lucide-react"
import { useI18n } from "@/lib/contexts/i18n"
import { toast } from "sonner"
import { useLocalStorage } from 'usehooks-ts'
import { useWallets } from "@/lib/utils/userUtils"

interface WalletData {
  id: string
  name: string | null
  address: string | null
  balance?: number      // DB authoritative balance, minor units (Phase 6)
  pendingBalance?: number
  blockchainBalance?: number
  createdAt: string
}

/**
 * Off-chain DPIP transfer (Phase 6): recipient by @username, address or wallet
 * id; amount in decimal DPIP converted server-side to minor units. Balance
 * shown from the DB ledger (never Kaleido on the transfer path).
 */
export const TokenTransfer = () => {
  const { t } = useI18n()
  const { wallets, isLoading, refreshWallets } = useWallets()
  const [selectedWalletId, setSelectedWalletId] = useLocalStorage<string | null>('dpip_selected_wallet', null)
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [isTransferring, setIsTransferring] = useState(false)
  const [confirming, setConfirming] = useState(false)

  // Auto-select first wallet if none selected
  useEffect(() => {
    if (!selectedWalletId && wallets && wallets.length > 0) {
      setSelectedWalletId(wallets[0].id)
    }
  }, [wallets, selectedWalletId, setSelectedWalletId])

  const selectedWallet = wallets.find((w: WalletData) => w.id === selectedWalletId)

  const executeTransfer = async () => {
    if (!selectedWalletId || !recipient.trim() || !amount.trim()) {
      toast.error(t('wallet.fillAllFields', { defaultValue: 'Please fill in all fields' }))
      return
    }

    const amountNum = parseFloat(amount)
    if (isNaN(amountNum) || amountNum <= 0) {
      toast.error(t('wallet.invalidAmount', { defaultValue: 'Please enter a valid amount' }))
      return
    }

    const recipientTarget = recipient.trim()
    const isWalletId = /^[a-f0-9]{24}$/i.test(recipientTarget)
    const isUsername = recipientTarget.startsWith('@')

    const body: Record<string, unknown> = {
      fromWalletId: selectedWalletId,
      amount: amountNum,
      note: note.trim() || null
    }
    if (isWalletId) body.toWalletId = recipientTarget
    else if (isUsername) body.toUsername = recipientTarget
    else body.toAddress = recipientTarget

    try {
      setIsTransferring(true)
      const response = await fetch('/api/v1/wallet/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })

      if (response.ok) {
        toast.success(t('wallet.transferCompleted', { defaultValue: 'Transfer completed' }))
        setRecipient('')
        setAmount('')
        setNote('')
        setConfirming(false)
        await refreshWallets()
      } else {
        const error = await response.json().catch(() => null)
        toast.error(
          error?.error ||
            t('wallet.failedToTransferTokens', { defaultValue: 'Failed to transfer tokens' })
        )
      }
    } catch (error) {
      console.error('Error transferring tokens:', error)
      toast.error(t('wallet.errorTransferringTokens', { defaultValue: 'Error transferring tokens' }))
    } finally {
      setIsTransferring(false)
    }
  }

  const dbBalanceMinor = selectedWallet?.balance ?? 0
  const displayBalance = (dbBalanceMinor / 100).toFixed(2)

  return (
    <div className="space-y-4 border rounded-lg p-4 bg-muted/50">
      <h3 className="text-lg font-semibold flex items-center gap-2">
        <Send className="h-5 w-5" />
        {t('wallet.transferTokens')}
      </h3>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : wallets.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t('wallet.noWallets', { defaultValue: 'Create a wallet first to transfer DPIP.' })}
        </p>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">{t('wallet.fromWallet')}</label>
            <Select
              value={selectedWalletId || undefined}
              onValueChange={(value) => setSelectedWalletId(value)}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('wallet.selectWallet')} />
              </SelectTrigger>
              <SelectContent>
                {wallets.map((wallet: WalletData) => (
                  <SelectItem key={wallet.id} value={wallet.id} className="break-words max-w-full">
                    {wallet.name || t('wallet.unnamedWallet')} — DPIP {((wallet.balance ?? 0) / 100).toFixed(2)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {t('wallet.availableBalance', { defaultValue: 'Available' })}: DPIP {displayBalance}
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              {t('wallet.recipient', { defaultValue: 'Recipient (@username, wallet id, or address)' })}
            </label>
            <Input
              placeholder="@username"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              {t('wallet.amount', { defaultValue: 'Amount' })} (DPIP)
            </label>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              {t('wallet.note', { defaultValue: 'Note (optional)' })}
            </label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t('wallet.notePlaceholder', { defaultValue: 'What is this for?' })}
            />
          </div>

          {confirming ? (
            <div className="space-y-2">
              <p className="text-sm">
                {t('wallet.confirmTransfer', { defaultValue: 'Send' })} <strong>{amount}</strong> DPIP{' '}
                {t('wallet.confirmTransferTo', { defaultValue: 'to' })} <strong>{recipient.trim()}</strong>?
              </p>
              <div className="flex gap-2">
                <Button onClick={executeTransfer} disabled={isTransferring} className="flex-1">
                  {isTransferring
                    ? t('wallet.transferring', { defaultValue: 'Transferring...' })
                    : t('wallet.confirm', { defaultValue: 'Confirm' })}
                </Button>
                <Button variant="outline" onClick={() => setConfirming(false)} disabled={isTransferring}>
                  {t('wallet.cancel', { defaultValue: 'Cancel' })}
                </Button>
              </div>
            </div>
          ) : (
            <Button
              onClick={() => setConfirming(true)}
              disabled={!selectedWalletId || !recipient.trim() || !amount.trim()}
              className="w-full"
            >
              {t('wallet.transferTokens')}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
