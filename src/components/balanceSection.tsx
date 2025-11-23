'use client'

import { useState, useEffect, useContext } from 'react'
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import { useUserData, useWallets } from "@/lib/userUtils"
import { GlobalContext } from "@/lib/contexts"
import { useI18n } from "@/lib/contexts/i18n"

import { Eye, EyeOff, DollarSign, ChevronDown, ChevronUp, Coins, Wallet } from "lucide-react"
import { useLocalStorage } from 'usehooks-ts';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"

interface WalletData {
  id: string
  name: string | null
  address: string | null
  balance: number | null
  blockchainBalance?: string
  createdAt: string
}

export const BalanceSection = () => {
  const { session, revealRedacted, setGlobalContext } = useContext(GlobalContext)
  const { t } = useI18n()
  const serverBalance = (session?.user as any)?.availableBalance ?? null
  const serverStashRaw = (session?.user as any)?.stash
  const serverStash = typeof serverStashRaw === 'number' ? serverStashRaw : (typeof serverStashRaw === 'string' ? parseFloat(serverStashRaw || '0') : 0)
  const serverEquityRaw = (session?.user as any)?.equity
  const serverEquity = typeof serverEquityRaw === 'number' ? serverEquityRaw : (typeof serverEquityRaw === 'string' ? parseFloat(serverEquityRaw || '0') : 0)
  const serverTotalEarningsRaw = (session?.user as any)?.totalEarnings
  const serverTotalEarnings = typeof serverTotalEarningsRaw === 'number' ? serverTotalEarningsRaw : (typeof serverTotalEarningsRaw === 'string' ? parseFloat(serverTotalEarningsRaw || '0') : 0)
  const [value, setValue, removeValue] = useLocalStorage('dpip_redacted', 0);
  const [hiddenBalance, setHiddenBalance] = useState(!revealRedacted)
  const [localBalance, setLocalBalance] = useState<string>(serverBalance !== null ? String(serverBalance) : '0')
  const [isDetailsExpanded, setIsDetailsExpanded] = useState(false)
  const { wallets, isLoading: isLoadingWallets } = useWallets()
  const [selectedWalletId, setSelectedWalletId] = useLocalStorage<string | null>('dpip_selected_wallet', null)

  const { isLoading, refreshUser } = useUserData()

  // Auto-select first wallet if none selected
  useEffect(() => {
    if (!selectedWalletId && wallets && wallets.length > 0) {
      setSelectedWalletId(wallets[0].id)
    }
  }, [wallets, selectedWalletId, setSelectedWalletId])

  // Sync hiddenBalance with GlobalContext revealRedacted
  useEffect(() => {
    setHiddenBalance(!revealRedacted)
  }, [revealRedacted])

  // Update local balance when server balance changes
  useEffect(() => {
    if (serverBalance !== null && serverBalance !== undefined) {
      setLocalBalance(String(serverBalance))
    }
  }, [serverBalance])

  const selectedWallet = wallets.find(w => w.id === selectedWalletId)
  const blockchainBalance = selectedWallet?.blockchainBalance || '0'

  const handleBalanceChange = (e: React.FocusEvent<HTMLInputElement>) => {
    const newValue = e.currentTarget.value
    setLocalBalance(newValue)
    const numericValue = parseFloat(newValue)
    fetch('/api/v1/user', { method: 'POST', body: JSON.stringify({
      availableBalance: isNaN(numericValue) ? 0 : numericValue,
      date: new Date()
    }) })
    setTimeout(() => {
      if (session?.user) {
        refreshUser()
      }
    }, 1500)
  }

  const handleHideBalance = () => {
    const newRevealState = !revealRedacted
    const newValue = newRevealState ? 1 : 0
    setValue(newValue)
    setGlobalContext((prev: any) => ({ ...prev, revealRedacted: newRevealState }))
    setHiddenBalance(!newRevealState)
  }

  const handleWithdrawStash = async () => {
    try {
      const response = await fetch('/api/v1/user', { 
        method: 'POST', 
        body: JSON.stringify({ withdrawStash: true })
      })
      
      if (response.ok) {
        await refreshUser()
      }
    } catch (error) {
      console.error('Error withdrawing stash:', error)
    }
  }

  const isDataLoading = isLoading && !session
  const maskedBalance = hiddenBalance ? '••••••' : localBalance

  return (
    <div className="p-3 sm:p-4 border rounded-lg border-body w-full max-w-full bg-muted backdrop-blur-sm">
      <Accordion type="single" collapsible className="w-full">
        <AccordionItem value="balance-section" className="border-none">
          <AccordionTrigger className="py-0 px-0 hover:no-underline">
            <div className="flex items-center gap-2">
              <Coins className="h-5 w-5" />
              <h3 className="text-base font-semibold text-body">
                {isDataLoading ? '...' : `Ð${maskedBalance}`}
              </h3>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-3 pb-0">
            <div className="space-y-3">
              {/* Wallet Selector */}
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Wallet className="h-4 w-4" />
                  Select Wallet
                </label>
                {isLoadingWallets ? (
                  <Skeleton className="h-9 w-full" />
                ) : (
                  <Select
                    value={selectedWalletId || undefined}
                    onValueChange={(value) => setSelectedWalletId(value)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select a wallet" />
                    </SelectTrigger>
                    <SelectContent>
                      {wallets.map((wallet) => (
                        <SelectItem key={wallet.id} value={wallet.id}>
                          {wallet.name || 'Unnamed Wallet'} ({wallet.address?.slice(0, 8)}...)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {selectedWallet && (
                  <div className="text-sm text-muted-foreground">
                    <div className="flex justify-between">
                      <span>Blockchain Balance:</span>
                      <span className={hiddenBalance ? "blur-sm" : ""}>
                        Ð{parseFloat(blockchainBalance).toFixed(18)}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div key={`menu__balance--${hiddenBalance}`} className="flex items-center gap-2">
                { isDataLoading ? (
                  <Skeleton className="h-9 flex-1" />
                ) : (
                  <>
                    { hiddenBalance ? <Input disabled value="••••••" className="flex-1" /> :
                      <Input 
                        type="number" 
                        step="any"
                        inputMode="decimal"
                        onBlur={handleBalanceChange} 
                        value={localBalance}
                        onChange={(e) => setLocalBalance(e.target.value)}
                        className="flex-1"
                      />
                    }
                    <Button className={`ml-2 border-accent ${ hiddenBalance ? "bg-input/80" : "bg-input/30"} text-foreground hover:text-background`} onClick={handleHideBalance}>
                      {hiddenBalance ?
                        <Eye /> : <EyeOff />
                      }
                    </Button>
                    <Button 
                      className="ml-2 border-accent bg-input/30 text-foreground hover:text-background" 
                      onClick={handleWithdrawStash}
                      disabled={serverStash <= 0}
                      title={t('common.withdrawStash')}
                    >
                      <DollarSign />
                    </Button>
                  </>
                )}
              </div>
              
              {/* Display stash and equity values */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>{t('common.stash')}:</span>
                  <span className={hiddenBalance ? "blur-sm" : ""}>
                    Ð{serverStash.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>{t('common.equity')}:</span>
                  <span className={hiddenBalance ? "blur-sm" : ""}>
                    Ð{serverEquity.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>{t('common.totalEarnings')}:</span>
                  <span className={hiddenBalance ? "blur-sm" : ""}>
                    Ð{serverTotalEarnings.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  )
}

