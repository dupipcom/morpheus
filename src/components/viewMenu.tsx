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
import { updateUser, isUserDataReady, useEnhancedLoadingState } from "@/lib/userUtils"

import { GlobalContext } from "@/lib/contexts"
import { useI18n } from "@/lib/contexts/i18n"

import { Eye, EyeOff } from "lucide-react"

import { useLocalStorage } from 'usehooks-ts';

export const ViewMenu = ({ active }: { active: string }) =>{
  
  const { session, setGlobalContext, theme } = useContext(GlobalContext)
  const { t, locale } = useI18n()
  const serverBalance = (session?.user as any)?.availableBalance
  const [value, setValue, removeValue] = useLocalStorage('redacted', 0);
  const [hiddenBalance, setHiddenBalance] = useState(true)

  const { data, mutate, error, isLoading } = useSWR(
    session?.user ? `/api/user` : null, 
    () => updateUser(session, setGlobalContext, { session, theme })
  )

  const handleBalanceChange = (e: React.FocusEvent<HTMLInputElement>) => {
    fetch('/api/v1/user', { method: 'POST', body: JSON.stringify({
      availableBalance: e.currentTarget.value,
      date: new Date()
    }) })
    setTimeout(() => updateUser(session, setGlobalContext, { session, theme }), 2000)
  }

  const handleHideBalance = () => {
    setHiddenBalance(!hiddenBalance)
    setValue(!value ? 1 : 0)
  }

  useEffect(() => {
    updateUser(session, setGlobalContext, { session, theme })
  }, [])

  // Use enhanced loading state to prevent flashing
  const isDataLoading = useEnhancedLoadingState(isLoading, session)

  return <NavigationMenu className="flex flex-col center text-center w-full m-auto">
  <NavigationMenuList className="grid grid-cols-2">
      <NavigationMenuItem >
        <NavigationMenuLink href={`/${locale}/app/day`} active={active === 'day'}>
          {t('common.day')}
        </NavigationMenuLink>
      </NavigationMenuItem>
      <NavigationMenuItem>
        <NavigationMenuLink href={`/${locale}/app/week`} active={active === 'week'}>
          {t('common.week')}
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
        </>
      )}
    </div>
  </div>
</NavigationMenu>

}