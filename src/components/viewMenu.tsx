'use client'

import React from 'react'
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
} from "@/components/ui/navigation-menu"
import { SteadyTasks } from '@/components/steady-tasks'

export const ViewMenu = ({ active, children }: { active: string; children?: React.ReactNode }) =>{
  return <NavigationMenu className="flex flex-col center text-center w-full m-auto px-2 sm:px-4">
    <NavigationMenuList className="flex flex-wrap justify-center gap-2">
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
      <NavigationMenuItem>
        <NavigationMenuLink href={`/app/invest`} active={active === 'invest'}>
          Invest
        </NavigationMenuLink>
      </NavigationMenuItem>
    </NavigationMenuList>
    <div className="mt-4 sm:mt-8 w-full">
      {children !== null && <SteadyTasks />}
      {children !== undefined && children !== null && (
        <div className="mt-4 sm:mt-8">
          {children}
        </div>
      )}
    </div>
  </NavigationMenu>
}