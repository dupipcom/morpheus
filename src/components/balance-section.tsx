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

export const BalanceSection = () => {
  const { session } = useContext(GlobalContext)
  const { t } = useI18n()
  const serverBalance = (session?.user as any)?.availableBalance ?? null
  const serverStashRaw = (session?.user as any)?.stash
  const serverStash = typeof serverStashRaw === 'number' ? serverStashRaw : (typeof serverStashRaw === 'string' ? parseFloat(serverStashRaw || '0') : 0)
  const serverEquityRaw = (session?.user as any)?.equity
  const serverEquity = typeof serverEquityRaw === 'number' ? serverEquityRaw : (typeof serverEquityRaw === 'string' ? parseFloat(serverEquityRaw || '0') : 0)
  const serverTotalEarningsRaw = (session?.user as any)?.totalEarnings
  const serverTotalEarnings = typeof serverTotalEarningsRaw === 'number' ? serverTotalEarningsRaw : (typeof serverTotalEarningsRaw === 'string' ? parseFloat(serverTotalEarningsRaw || '0') : 0)
  const [value, setValue, removeValue] = useLocalStorage('redacted', 0);
  const [hiddenBalance, setHiddenBalance] = useState(true)
  const [localBalance, setLocalBalance] = useState<string>(serverBalance !== null ? String(serverBalance) : '0')
  const [isDetailsExpanded, setIsDetailsExpanded] = useState(false)

  const { isLoading, refreshUser } = useUserData()

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
    setHiddenBalance(!hiddenBalance)
    setValue(!value ? 1 : 0)
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

  return (
    <div className="my-8">
      <div key={`menu__balance--${hiddenBalance}`} className="flex items-center gap-2">
        <Coins className="h-6 w-6" />
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
      
      {/* Expand button - visible on all screen sizes */}
      <Button
        variant="ghost"
        className="mt-2 w-full text-muted-foreground hover:text-foreground"
        onClick={() => setIsDetailsExpanded(!isDetailsExpanded)}
      >
        {isDetailsExpanded ? (
          <>
            <ChevronUp className="h-4 w-4 mr-1" />
            Hide Details
          </>
        ) : (
          <>
            <ChevronDown className="h-4 w-4 mr-1" />
            Show Details
          </>
        )}
      </Button>
      
      {/* Display stash and equity values */}
      <div className={`mt-4 space-y-2 ${isDetailsExpanded ? 'block' : 'hidden'}`}>
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
  )
}

