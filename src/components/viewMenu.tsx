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

import { GlobalContext } from "@/lib/contexts"

import { Eye, EyeOff } from "lucide-react"

import { useLocalStorage } from 'usehooks-ts';

export const ViewMenu = ({ active }) =>{
  
  const { session, setGlobalContext, ...globalContext } = useContext(GlobalContext)
  const serverBalance = session?.user?.availableBalance
  const [value, setValue, removeValue] = useLocalStorage('redacted', 0);
  const [hiddenBalance, setHiddenBalance] = useState(true)

  const updateUser = async () => {
    try {
      const response = await fetch('/api/v1/user', { method: 'GET' })
      const updatedUser = await response.json()
      setGlobalContext({...globalContext, session: { ...session, user: updatedUser } })
    } catch (e) {
      console.error(e)
    }
  }

  const { data, mutate, error, isLoading } = useSWR(`/api/user`, updateUser)

  const handleBalanceChange = (e) => {
    fetch('/api/v1/user', { method: 'POST', body: JSON.stringify({
      availableBalance: e.currentTarget.value,
      date: new Date()
    }) })
    setTimeout(() => updateUser(), 2000)
  }

  const handleHideBalance = () => {
    setHiddenBalance(!hiddenBalance)
    setValue(!value)
  }

  useEffect(() => {
    updateUser()
  }, [])

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
    <div className="flex">
      { hiddenBalance ? <Input disabled /> :
        <Input type="number" step="0.01" onBlur={handleBalanceChange} defaultValue={serverBalance} />
      }
      <Button className={`ml-2 border-accent ${ hiddenBalance ? "bg-input/80" : "bg-input/30"} text-foreground`} onClick={handleHideBalance}>
        {hiddenBalance ?
          <Eye /> : <EyeOff />
        }
      </Button>
    </div>
  </div>
</NavigationMenu>

}