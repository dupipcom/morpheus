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
import { useWallets } from "@/lib/userUtils"

interface WalletData {
  id: string
  name: string | null
  address: string | null
  balance: number | null
  blockchainBalance?: string
  createdAt: string
}

export const TokenTransfer = () => {
  const { t } = useI18n()
  const { wallets, isLoading, refreshWallets } = useWallets()
  const [selectedWalletId, setSelectedWalletId] = useLocalStorage<string | null>('dpip_selected_wallet', null)
  const [toAddress, setToAddress] = useState('')
  const [amount, setAmount] = useState('')
  const [isTransferring, setIsTransferring] = useState(false)

  // Auto-select first wallet if none selected
  useEffect(() => {
    if (!selectedWalletId && wallets && wallets.length > 0) {
      setSelectedWalletId(wallets[0].id)
    }
  }, [wallets, selectedWalletId, setSelectedWalletId])

  const handleTransfer = async () => {
    if (!selectedWalletId || !toAddress.trim() || !amount.trim()) {
      toast.error('Please fill in all fields')
      return
    }

    const amountNum = parseFloat(amount)
    if (isNaN(amountNum) || amountNum <= 0) {
      toast.error('Please enter a valid amount')
      return
    }

    try {
      setIsTransferring(true)
      const response = await fetch('/api/v1/wallet/transfer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fromWalletId: selectedWalletId,
          toAddress: toAddress.trim(),
          amount: amountNum.toString(),
        }),
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          toast.success(t('wallet.transferCompleted'))
        }
        setToAddress('')
        setAmount('')
        // Refresh wallets to update balances
        await refreshWallets()
      } else {
        const error = await response.json()
        toast.error(error.error || t('wallet.failedToTransferTokens'))
      }
    } catch (error) {
      console.error('Error transferring tokens:', error)
      toast.error(t('wallet.errorTransferringTokens'))
    } finally {
      setIsTransferring(false)
    }
  }

  const selectedWallet = wallets.find((w: WalletData) => w.id === selectedWalletId)

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
          Create a wallet first to transfer tokens.
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
                    {wallet.name || t('wallet.unnamedWallet')} - {wallet.blockchainBalance ? `Ð${parseFloat(wallet.blockchainBalance).toFixed(18)}` : 'Ð0'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">{t('wallet.toAddress')}</label>
            <Input
              placeholder="0x..."
              value={toAddress}
              onChange={(e) => setToAddress(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">{t('wallet.amount')} (Ð)</label>
            <Input
              type="number"
              step="any"
              placeholder="0.0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          <Button
            onClick={handleTransfer}
            disabled={isTransferring || !selectedWalletId || !toAddress.trim() || !amount.trim()}
            className="w-full"
          >
            {isTransferring ? 'Transferring...' : t('wallet.transferTokens')}
          </Button>
        </div>
      )}
    </div>
  )
}

