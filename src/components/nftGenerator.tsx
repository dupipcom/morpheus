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
import { Sparkles } from "lucide-react"
import { useI18n } from "@/lib/contexts/i18n"
import { toast } from "sonner"
import { useLocalStorage } from 'usehooks-ts'
import { useWallets } from "@/lib/userUtils"

export const NFTGenerator = () => {
  const { t } = useI18n()
  const { wallets, isLoading } = useWallets()
  const [selectedWalletId, setSelectedWalletId] = useLocalStorage<string | null>('dpip_selected_wallet', null)
  const [tokenUri, setTokenUri] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)

  // Auto-select first wallet if none selected
  useEffect(() => {
    if (!selectedWalletId && wallets && wallets.length > 0) {
      setSelectedWalletId(wallets[0].id)
    }
  }, [wallets, selectedWalletId, setSelectedWalletId])

  const handleGenerateNFT = async () => {
    if (!selectedWalletId) {
      toast.error('Please select a wallet')
      return
    }

    try {
      setIsGenerating(true)
      const response = await fetch('/api/v1/wallet/nft', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          walletId: selectedWalletId,
          tokenUri: tokenUri.trim() || undefined,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        toast.success(`NFT generation initiated! Transaction: ${data.transactionHash?.slice(0, 10)}...`)
        setTokenUri('')
      } else {
        const error = await response.json()
        toast.error(error.error || 'Failed to generate NFT')
      }
    } catch (error) {
      console.error('Error generating NFT:', error)
      toast.error('Error generating NFT')
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="space-y-4 border rounded-lg p-4 bg-muted/50">
      <h3 className="text-lg font-semibold flex items-center gap-2">
        <Sparkles className="h-5 w-5" />
        Generate NFT
      </h3>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : wallets.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Create a wallet first to generate NFTs.
        </p>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">To Wallet</label>
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
                    {wallet.name || 'Unnamed Wallet'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Token URI (Optional)</label>
            <Input
              placeholder="https://..."
              value={tokenUri}
              onChange={(e) => setTokenUri(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Metadata URI for the NFT (IPFS, HTTP, etc.)
            </p>
          </div>

          <Button
            onClick={handleGenerateNFT}
            disabled={isGenerating || !selectedWalletId}
            className="w-full"
          >
            {isGenerating ? 'Generating...' : 'Generate NFT'}
          </Button>

          <p className="text-xs text-muted-foreground">
            Note: NFT generation requires an NFT contract to be deployed on your Kaleido network.
          </p>
        </div>
      )}
    </div>
  )
}

