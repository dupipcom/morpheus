'use client'

import React from 'react'
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
} from "@/components/ui/navigation-menu"
import { SteadyTasks } from '@/components/steady-tasks'

export const ViewMenu = ({ active, children }: { active: string; children?: React.ReactNode }) => {
  return (
    <div className="relative p-4 w-full max-w-[1200px] p-4 m-auto">
      <div className="m-auto grid grid-cols-1 md:grid-cols-4 grid-rows-auto md:grid-rows-auto gap-4 auto-rows-min">
        {/* Row 1: Navigation Links (Mobile: Row 1, Desktop: Row 1, Cols 1-4) */}
        <div className="col-span-1 md:col-span-4 row-span-1">
          <NavigationMenu className="flex flex-col center text-center w-full m-auto">
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
          </NavigationMenu>
        </div>

        {/* Row 2: Steady Tasks (Mobile: Row 2, Desktop: Row 2, Cols 1-3) */}
        {children !== null && (
          <div className="col-span-1 md:col-span-2 row-span-1">
            <SteadyTasks />
          </div>
        )}

        {/* Row 3: Publish Note (Mobile: Row 3, Desktop: Row 2, Col 4) */}
        {children !== undefined && children !== null && (
          <div className="col-span-1 md:col-span-2 row-span-1">
            {children}
          </div>
        )}
      </div>
    </div>
  )
}