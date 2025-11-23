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
  const [wallets, setWallets] = useState<WalletData[]>([])
  const [selectedWalletId, setSelectedWalletId] = useLocalStorage<string | null>('dpip_selected_wallet', null)
  const [toAddress, setToAddress] = useState('')
  const [amount, setAmount] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isTransferring, setIsTransferring] = useState(false)

  useEffect(() => {
    const fetchWallets = async () => {
      try {
        setIsLoading(true)
        const response = await fetch('/api/v1/wallet')
        if (response.ok) {
          const data = await response.json()
          setWallets(data.wallets || [])
          if (!selectedWalletId && data.wallets && data.wallets.length > 0) {
            setSelectedWalletId(data.wallets[0].id)
          }
        }
      } catch (error) {
        console.error('Error fetching wallets:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchWallets()
  }, [selectedWalletId, setSelectedWalletId])

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
        toast.success(`Transfer initiated! Transaction: ${data.transactionHash.slice(0, 10)}...`)
        setToAddress('')
        setAmount('')
        // Refresh wallets to update balances
        const walletsResponse = await fetch('/api/v1/wallet')
        if (walletsResponse.ok) {
          const walletsData = await walletsResponse.json()
          setWallets(walletsData.wallets || [])
        }
      } else {
        const error = await response.json()
        toast.error(error.error || 'Failed to transfer tokens')
      }
    } catch (error) {
      console.error('Error transferring tokens:', error)
      toast.error('Error transferring tokens')
    } finally {
      setIsTransferring(false)
    }
  }

  const selectedWallet = wallets.find(w => w.id === selectedWalletId)

  return (
    <div className="space-y-4 border rounded-lg p-4 bg-muted/50">
      <h3 className="text-lg font-semibold flex items-center gap-2">
        <Send className="h-5 w-5" />
        Transfer Tokens
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
            <label className="text-sm font-medium">From Wallet</label>
            <Select
              value={selectedWalletId || undefined}
              onValueChange={(value) => setSelectedWalletId(value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select wallet" />
              </SelectTrigger>
              <SelectContent>
                {wallets.map((wallet) => (
                  <SelectItem key={wallet.id} value={wallet.id}>
                    {wallet.name || 'Unnamed Wallet'} - {wallet.blockchainBalance ? `Ð${parseFloat(wallet.blockchainBalance).toFixed(4)}` : 'Ð0'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">To Address</label>
            <Input
              placeholder="0x..."
              value={toAddress}
              onChange={(e) => setToAddress(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Amount (Ð)</label>
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
            {isTransferring ? 'Transferring...' : 'Transfer Tokens'}
          </Button>
        </div>
      )}
    </div>
  )
}

