'use client'

import { useState, useEffect } from 'react'
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Sparkles, RefreshCw } from "lucide-react"
import { useI18n } from "@/lib/contexts/i18n"
import { toast } from "sonner"
import { useLocalStorage } from 'usehooks-ts'
import { useWallets } from "@/lib/userUtils"

interface NFT {
  tokenId: string
  tokenURI: string
}

export const NFTGenerator = () => {
  const { t } = useI18n()
  const { wallets, isLoading } = useWallets()
  const [selectedWalletId, setSelectedWalletId] = useLocalStorage<string | null>('dpip_selected_wallet', null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [nfts, setNfts] = useState<NFT[]>([])
  const [isLoadingNfts, setIsLoadingNfts] = useState(false)

  // Auto-select first wallet if none selected
  useEffect(() => {
    if (!selectedWalletId && wallets && wallets.length > 0) {
      setSelectedWalletId(wallets[0].id)
    }
  }, [wallets, selectedWalletId, setSelectedWalletId])

  // Fetch NFTs when wallet selection changes
  const fetchNFTs = async () => {
    if (!selectedWalletId) {
      setNfts([])
      return
    }

    try {
      setIsLoadingNfts(true)
      const response = await fetch(`/api/v1/wallet/nft/list?walletId=${selectedWalletId}`)
      
      if (response.ok) {
        const data = await response.json()
        setNfts(data.nfts || [])
      } else {
        const error = await response.json()
        console.error('Error fetching NFTs:', error)
        setNfts([])
      }
    } catch (error) {
      console.error('Error fetching NFTs:', error)
      setNfts([])
    } finally {
      setIsLoadingNfts(false)
    }
  }

  useEffect(() => {
    fetchNFTs()
  }, [selectedWalletId])

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
        }),
      })

      if (response.ok) {
        const data = await response.json()
        toast.success(`NFT generation initiated! Transaction: ${data.transactionHash?.slice(0, 10)}...`)
        // Refresh NFT list after successful generation
        await fetchNFTs()
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

          {/* NFT List Section */}
          <div className="mt-6 pt-6 border-t">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-sm font-semibold">My NFTs</h4>
              <Button
                variant="ghost"
                size="sm"
                onClick={fetchNFTs}
                disabled={isLoadingNfts || !selectedWalletId}
                className="h-8 w-8 p-0"
              >
                <RefreshCw className={`h-4 w-4 ${isLoadingNfts ? 'animate-spin' : ''}`} />
              </Button>
            </div>

            {isLoadingNfts ? (
              <div className="space-y-2">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : nfts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No NFTs found in this wallet.
              </p>
            ) : (
              <div className="space-y-2">
                {nfts.map((nft) => (
                  <div
                    key={nft.tokenId}
                    className="border rounded-lg p-3 bg-background hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="text-sm font-medium">Token ID: {nft.tokenId}</p>
                        {nft.tokenURI && (
                          <p className="text-xs text-muted-foreground mt-1 break-all">
                            URI: {nft.tokenURI}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground text-center pt-2">
                  Total: {nfts.length} NFT{nfts.length !== 1 ? 's' : ''}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

