import { useState, useEffect, useContext } from 'react'
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuIndicator,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  NavigationMenuViewport,
} from "@/components/ui/navigation-menu"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

import useSWR from "swr"
import { fetcher } from "@/lib/utils"
import { updateUser, isUserDataReady, useEnhancedLoadingState, useUserData } from "@/lib/userUtils"

import { GlobalContext } from "@/lib/contexts"
import { useI18n } from "@/lib/contexts/i18n"

import { Eye, EyeOff, DollarSign } from "lucide-react"

import { useLocalStorage } from 'usehooks-ts';

export const ViewMenu = ({ active }: { active: string }) =>{
  
  const { session, setGlobalContext, theme } = useContext(GlobalContext)
  const { t, locale } = useI18n()
  const serverBalance = (session?.user as any)?.availableBalance
  const serverStash = (session?.user as any)?.stash || "0"
  const serverEquity = (session?.user as any)?.equity || "0"
  const serverTotalEarnings = (session?.user as any)?.totalEarnings || "0"
  const [value, setValue, removeValue] = useLocalStorage('redacted', 0);
  const [hiddenBalance, setHiddenBalance] = useState(true)

  const { isLoading, refreshUser } = useUserData()

  const handleBalanceChange = (e: React.FocusEvent<HTMLInputElement>) => {
    fetch('/api/v1/user', { method: 'POST', body: JSON.stringify({
      availableBalance: e.currentTarget.value,
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
      await fetch('/api/v1/user', { 
        method: 'POST', 
        body: JSON.stringify({ withdrawStash: true })
      })
      setTimeout(() => {
        if (session?.user) {
          refreshUser()
        }
      }, 1500)
    } catch (error) {
      console.error('Error withdrawing stash:', error)
    }
  }

  // No on-mount refresh; SWR fetches once and dedupes across components

  // Use enhanced loading state to prevent flashing
  const isDataLoading = useEnhancedLoadingState(isLoading, session)

  return <NavigationMenu className="flex flex-col center text-center w-full m-auto">
  <NavigationMenuList className="grid grid-cols-3">
  <NavigationMenuItem>
        <NavigationMenuLink href={`/app/feel`} active={active === 'feel'}>
          Feel
        </NavigationMenuLink>
      </NavigationMenuItem>
      <NavigationMenuItem >
        <NavigationMenuLink href={`/app/do`} active={active === 'do'}>
          Do
        </NavigationMenuLink>
      </NavigationMenuItem>
      <NavigationMenuItem>
        <NavigationMenuLink href={`/app/be`} active={active === 'be'}>
          Be
        </NavigationMenuLink>
      </NavigationMenuItem>
  </NavigationMenuList>
  <div className="my-8">
    <label>{t('common.availableBalance')}</label>
    <div key={`menu__balance--${hiddenBalance}`} className="flex">
      { isDataLoading ? (
        <Skeleton className="h-9 flex-1" />
      ) : (
        <>
          { hiddenBalance ? <Input disabled /> :
            <Input type="number" step="0.01" onBlur={handleBalanceChange} defaultValue={serverBalance} />
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
    
    {/* Display stash and equity values */}
    <div className="mt-4 space-y-2">
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
</NavigationMenu>

}