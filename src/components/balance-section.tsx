'use client'

import { useState, useEffect, useContext } from 'react'
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

import { useUserData } from "@/lib/userUtils"
import { GlobalContext } from "@/lib/contexts"
import { useI18n } from "@/lib/contexts/i18n"

import { Eye, EyeOff, DollarSign, ChevronDown, ChevronUp } from "lucide-react"
import { useLocalStorage } from 'usehooks-ts';

export const BalanceSection = () => {
  const { session } = useContext(GlobalContext)
  const { t } = useI18n()
  const serverBalance = (session?.user as any)?.availableBalance
  const serverStash = (session?.user as any)?.stash || "0"
  const serverEquity = (session?.user as any)?.equity || "0"
  const serverTotalEarnings = (session?.user as any)?.totalEarnings || "0"
  const [value, setValue, removeValue] = useLocalStorage('redacted', 0);
  const [hiddenBalance, setHiddenBalance] = useState(true)
  const [localBalance, setLocalBalance] = useState(serverBalance)
  const [isDetailsExpanded, setIsDetailsExpanded] = useState(false)

  const { isLoading, refreshUser } = useUserData()

  // Update local balance when server balance changes
  useEffect(() => {
    setLocalBalance(serverBalance)
  }, [serverBalance])

  const handleBalanceChange = (e: React.FocusEvent<HTMLInputElement>) => {
    const newValue = e.currentTarget.value
    setLocalBalance(newValue)
    fetch('/api/v1/user', { method: 'POST', body: JSON.stringify({
      availableBalance: newValue,
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
      <label>{t('common.availableBalance')}</label>
      <div key={`menu__balance--${hiddenBalance}`} className="flex">
        { isDataLoading ? (
          <Skeleton className="h-9 flex-1" />
        ) : (
          <>
            { hiddenBalance ? <Input disabled value="••••••" /> :
              <Input 
                type="number" 
                step="0.01" 
                onBlur={handleBalanceChange} 
                value={parseFloat(localBalance || '0').toFixed(2)}
                onChange={(e) => setLocalBalance(e.target.value)}
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
              disabled={parseFloat(serverStash) <= 0}
              title="Withdraw Stash"
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
            Ð{parseFloat(serverStash).toFixed(2)}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span>{t('common.equity')}:</span>
          <span className={hiddenBalance ? "blur-sm" : ""}>
            Ð{parseFloat(serverEquity).toFixed(2)}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span>{t('common.totalEarnings')}:</span>
          <span className={hiddenBalance ? "blur-sm" : ""}>
            Ð{parseFloat(serverTotalEarnings).toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  )
}

