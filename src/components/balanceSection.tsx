'use client'

import { useState, useEffect, useContext } from 'react'
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

import { useUserData } from "@/lib/userUtils"
import { GlobalContext } from "@/lib/contexts"
import { useI18n } from "@/lib/contexts/i18n"

import { Eye, EyeOff, DollarSign, ChevronDown, ChevronUp, Coins } from "lucide-react"
import { useLocalStorage } from 'usehooks-ts';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"

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

  const { isLoading, refreshUser } = useUserData()

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

