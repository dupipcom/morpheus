'use client'

import { useState } from 'react'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Wallet, Plus, Trash2, Copy, Check } from "lucide-react"
import { useI18n } from "@/lib/contexts/i18n"
import { toast } from "sonner"
import { useWallets } from "@/lib/userUtils"

interface WalletData {
  id: string
  name: string | null
  address: string | null
  balance: number | null
  blockchainBalance?: string
  createdAt: string
}

export const WalletManager = () => {
  const { t } = useI18n()
  const { wallets, isLoading, refreshWallets } = useWallets()
  const [isCreating, setIsCreating] = useState(false)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [newWalletName, setNewWalletName] = useState('')
  const [walletToDelete, setWalletToDelete] = useState<string | null>(null)
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null)

  const handleCreateWallet = async () => {
    if (!newWalletName.trim()) {
      toast.error('Please enter a wallet name')
      return
    }

    try {
      setIsCreating(true)
      const response = await fetch('/api/v1/wallet', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: newWalletName }),
      })

      if (response.ok) {
        const data = await response.json()
        setNewWalletName('')
        setIsDialogOpen(false)
        toast.success('Wallet created successfully')
        // Refresh wallets to get updated list
        await refreshWallets()
      } else {
        const error = await response.json()
        toast.error(error.error || 'Failed to create wallet')
      }
    } catch (error) {
      console.error('Error creating wallet:', error)
      toast.error('Error creating wallet')
    } finally {
      setIsCreating(false)
    }
  }

  const handleDeleteWallet = async () => {
    if (!walletToDelete) return

    try {
      const response = await fetch(`/api/v1/wallet/${walletToDelete}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        setWalletToDelete(null)
        toast.success('Wallet deleted successfully')
        // Refresh wallets to get updated list
        await refreshWallets()
      } else {
        const error = await response.json()
        toast.error(error.error || 'Failed to delete wallet')
      }
    } catch (error) {
      console.error('Error deleting wallet:', error)
      toast.error('Error deleting wallet')
    }
  }

  const handleCopyAddress = (address: string) => {
    navigator.clipboard.writeText(address)
    setCopiedAddress(address)
    toast.success('Address copied to clipboard')
    setTimeout(() => setCopiedAddress(null), 2000)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Wallets</h3>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2">
              <Plus className="h-4 w-4" />
              Create Wallet
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Wallet</DialogTitle>
              <DialogDescription>
                Create a new blockchain wallet. A new address will be generated.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <Input
                placeholder="Wallet name (e.g., Savings, Trading)"
                value={newWalletName}
                onChange={(e) => setNewWalletName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleCreateWallet()
                  }
                }}
              />
              <Button
                onClick={handleCreateWallet}
                disabled={isCreating || !newWalletName.trim()}
                className="w-full"
              >
                {isCreating ? 'Creating...' : 'Create Wallet'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : wallets.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Wallet className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>No wallets yet. Create your first wallet to get started.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {wallets.map((wallet) => (
            <div
              key={wallet.id}
              className="border rounded-lg p-4 space-y-2 bg-muted/50"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Wallet className="h-4 w-4 text-muted-foreground" />
                    <h4 className="font-medium">
                      {wallet.name || 'Unnamed Wallet'}
                    </h4>
                  </div>
                  {wallet.address && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <code className="text-xs font-mono">
                        {wallet.address.slice(0, 10)}...{wallet.address.slice(-8)}
                      </code>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={() => handleCopyAddress(wallet.address!)}
                      >
                        {copiedAddress === wallet.address ? (
                          <Check className="h-3 w-3" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </Button>
                    </div>
                  )}
                  <div className="mt-2 text-sm">
                    <span className="text-muted-foreground">Balance: </span>
                    <span className="font-medium">
                      {wallet.blockchainBalance
                        ? `Ð${parseFloat(wallet.blockchainBalance).toFixed(18)}`
                        : 'Ð0'}
                    </span>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setWalletToDelete(wallet.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <AlertDialog
        open={walletToDelete !== null}
        onOpenChange={(open) => !open && setWalletToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Wallet</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this wallet? This action cannot be undone.
              The wallet will be removed from your account, but the blockchain address
              and its funds will remain on the blockchain.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteWallet}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

