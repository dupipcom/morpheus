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
    <div className="relative p-4 w-full max-w-[1200px] p-4 m-auto mb-4 md:mb-8">
      <div className="m-auto grid grid-cols-1 md:grid-cols-4 grid-rows-auto md:grid-rows-auto gap-4 auto-rows-min">
        {/* Row 1: Navigation Links (Mobile: Row 1, Desktop: Row 1, Cols 1-4) */}


        {/* Row 2: Steady Tasks (Mobile: Row 2, Desktop: Row 2, Cols 1-4) */}
        {children !== null && (
          <div className="col-span-1 md:col-span-4 row-span-1">
            <SteadyTasks />
          </div>
        )}
      </div>
    </div>
  )
}