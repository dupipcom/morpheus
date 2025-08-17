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
import { updateUser } from "@/lib/userUtils"
import { LoadingSkeleton } from "@/components/ui/skeleton-loader"

import { GlobalContext } from "@/lib/contexts"

import { Eye, EyeOff } from "lucide-react"

import { useLocalStorage } from 'usehooks-ts';

export const ViewMenu = ({ active }) =>{
  
  const { session, setGlobalContext, ...globalContext } = useContext(GlobalContext)
  const serverBalance = session?.user?.availableBalance
  const [value, setValue, removeValue] = useLocalStorage('redacted', 0);
  const [hiddenBalance, setHiddenBalance] = useState(true)

  const { data, mutate, error, isLoading } = useSWR(`/api/user`, () => updateUser(session, setGlobalContext, globalContext))

  const handleBalanceChange = (e) => {
    fetch('/api/v1/user', { method: 'POST', body: JSON.stringify({
      availableBalance: e.currentTarget.value,
      date: new Date()
    }) })
    setTimeout(() => updateUser(session, setGlobalContext, globalContext), 2000)
  }

  const handleHideBalance = () => {
    setHiddenBalance(!hiddenBalance)
    setValue(!value)
  }

  useEffect(() => {
    updateUser(session, setGlobalContext, globalContext)
  }, [])

  if (isLoading) {
    return <LoadingSkeleton />
  }

  return <NavigationMenu className="flex flex-col center text-center w-full m-auto">
  <NavigationMenuList className="grid grid-cols-3">
      <NavigationMenuItem >
        <NavigationMenuLink href="/app/day" active={active === 'day'}>
          Day
        </NavigationMenuLink>
      </NavigationMenuItem>
      <NavigationMenuItem>
        <NavigationMenuLink href="/app/week" active={active === 'week'}>
          Week
        </NavigationMenuLink>
      </NavigationMenuItem>
      <NavigationMenuItem>
        <NavigationMenuLink href="/app/mood" active={active === 'mood'}>
          Mood
        </NavigationMenuLink>
       </NavigationMenuItem>
  </NavigationMenuList>
  <div className="my-8">
    <label>Available Balance:</label>
    <div key={`menu__balance--${hiddenBalance}`} className="flex">
      { hiddenBalance ? <Input disabled /> :
        <Input type="number" step="0.01" onBlur={handleBalanceChange} defaultValue={serverBalance} />
      }
      <Button className={`ml-2 border-accent ${ hiddenBalance ? "bg-input/80" : "bg-input/30"} text-foreground hover:text-background`} onClick={handleHideBalance}>
        {hiddenBalance ?
          <Eye /> : <EyeOff />
        }
      </Button>
    </div>
  </div>
</NavigationMenu>

}