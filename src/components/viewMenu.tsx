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

function getWeekNumber(d) {
    // Copy date so don't modify original
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    // Set to nearest Thursday: current date + 4 - current day number
    // Make Sunday's day number 7
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay()||7));
    // Get first day of year
    var yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
    // Calculate full weeks to nearest Thursday
    var weekNo = Math.ceil(( ( (d - yearStart) / 86400000) + 1)/7);
    // Return array of year and week number
    return ['W', weekNo];
}

export const ViewMenu = ({ active }) =>{

  return <NavigationMenu className="flex flex-col center text-center w-full m-auto">
  <NavigationMenuList className="flex flex-wrap flex-col md:!flex-row">
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
    <Input />
  </div>
  <div className="">
    <div className="flex flex-wrap justify-center">
      <div className="m-8 flex flex-col">
        <label>W29</label>
        <Button>Close week</Button>
      </div>
      <div className="m-8 flex flex-col">
        <label>{getWeekNumber(new Date())}</label>
        <Button>Close week</Button>
      </div>
    </div>
    <div className="flex flex-wrap justify-center">
      <div className="m-8 flex flex-col">
        <label>Friday, Jul 25, 2025</label>
        <Button>Close day</Button>
      </div>
      <div className="m-8 flex flex-col">
        <label>Friday, Jul 25, 2025</label>
        <Button>Close day</Button>
      </div>
      <div className="m-8 flex flex-col">
        <label>{new Date().toLocaleString("en-US", {weekday: "long", year: "numeric", month: "short", day: "numeric" })}</label>
        <Button>Close day</Button>
      </div>
    </div>
  </div>
</NavigationMenu>

}