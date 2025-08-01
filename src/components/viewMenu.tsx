import { useState, useEffect } from 'react'
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
import { useSession, signIn, signOut } from "next-auth/react"

export const ViewMenu = ({ active }) =>{
  const { data: session, update } = useSession()
  const serverBalance = session?.user?.availableBalance

  const updateUser = async () => {
    const response = await fetch('/api/v1/user', { method: 'GET' })
    const updatedUser = await response.json()
    update({ ...session, user: { ...session?.user, ...updatedUser }})
  }
  

  const handleBalanceChange = (e) => {
    fetch('/api/v1/user', { method: 'POST', body: JSON.stringify({
      availableBalance: e.currentTarget.value
    }) })
    setTimeout(() => updateUser(), 2000)
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
      <NavigationMenuItem>
        <NavigationMenuLink>
          <a href="/logout">{ session?.user ? "Logout" : "Login" }</a>
        </NavigationMenuLink>
      </NavigationMenuItem>
  </NavigationMenuList>
  <div className="my-8">
    <label>Available Balance:</label>
    <Input onBlur={handleBalanceChange} defaultValue={serverBalance} />
  </div>
</NavigationMenu>

}