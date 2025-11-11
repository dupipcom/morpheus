'use client'

import React, { useState, useEffect, useRef } from 'react'
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
} from "@/components/ui/navigationMenu"
import { SteadyTasks } from '@/components/steadyTasks'

export const ViewMenu = ({ active, children }: { active: string; children?: React.ReactNode }) => {
  const [hasSteadyTasks, setHasSteadyTasks] = useState(true)
  const steadyTasksRef = useRef<HTMLDivElement>(null)

  // Check if SteadyTasks component has rendered content
  useEffect(() => {
    const checkSteadyTasks = () => {
      if (steadyTasksRef.current) {
        // Check if the ref's parent has any visible children
        const hasContent = steadyTasksRef.current.children.length > 0 && 
          Array.from(steadyTasksRef.current.children).some((child) => {
            return child instanceof HTMLElement && 
              (child.offsetHeight > 0 || child.offsetWidth > 0 || child.textContent?.trim())
          })
        setHasSteadyTasks(hasContent)
      }
    }

    // Check initially and after a short delay to allow SteadyTasks to render
    checkSteadyTasks()
    const timeout = setTimeout(checkSteadyTasks, 100)
    
    return () => clearTimeout(timeout)
  }, [])

  return (
    <div className="relative p-4 w-full max-w-[1200px] p-4 m-auto mb-4 md:mb-8">
      <div className="m-auto grid grid-cols-1 md:grid-cols-4 grid-rows-auto md:grid-rows-auto gap-4 auto-rows-min">
        {/* Row 1: Navigation Links (Mobile: Row 1, Desktop: Row 1, Cols 1-4) */}


        {/* Row 2: Steady Tasks (Mobile: Row 2, Desktop: Row 2, Cols 1-4) */}
        {children !== null && hasSteadyTasks && (
          <div ref={steadyTasksRef} className="col-span-1 md:col-span-4 row-span-1">
            <SteadyTasks />
          </div>
        )}
      </div>
    </div>
  )
}