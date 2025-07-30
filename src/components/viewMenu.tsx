import { useState } from 'react'
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

export const ViewMenu = ({ active }) =>{
  const [balance, setBalance] = useState(0)

  const handleBalanceChange = (e) => {
    console.log("UPDATE")
    fetch('/api/v1/user', { method: 'POST', body: JSON.stringify({
      availableBalance: e.currentTarget.value
    }) })
  }

  return <NavigationMenu className="flex flex-col center text-center w-full m-auto">
  <NavigationMenuList className="grid grid-cols-3">
      <NavigationMenuItem >
        <NavigationMenuLink active={active === 'dashboard'}>
          <a href="/app/dashboard">Dashboard</a>
        </NavigationMenuLink>
      </NavigationMenuItem >
      <NavigationMenuItem >
        <NavigationMenuLink active={active === 'day'}>
          <a href="/app/day">Day</a>
        </NavigationMenuLink>
      </NavigationMenuItem>
      <NavigationMenuItem>
        <NavigationMenuLink active={active === 'week'}>
          <a href="/app/week">Week</a>
        </NavigationMenuLink>
      </NavigationMenuItem>
      <NavigationMenuItem>
        <NavigationMenuLink active={active === 'mood'}>
          <a href="/app/mood">Mood</a>
        </NavigationMenuLink>
       </NavigationMenuItem>
      <NavigationMenuItem>
        <NavigationMenuLink active={active === 'settings'}>
          <a href="/app/settings">Settings</a>
        </NavigationMenuLink>
      </NavigationMenuItem>
  </NavigationMenuList>
  <div className="my-8">
    <label>Available Balance:</label>
    <Input onChange={handleBalanceChange} />
  </div>
</NavigationMenu>

}