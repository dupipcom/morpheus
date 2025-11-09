'use client'

import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
} from "@/components/ui/navigation-menu"
import { SteadyTasks } from '@/components/steady-tasks'

export const ViewMenu = ({ active }: { active: string }) =>{
  return <NavigationMenu className="flex flex-col center text-center w-full m-auto">
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
    <div className="mt-8">
      <SteadyTasks />
    </div>
  </NavigationMenu>
}