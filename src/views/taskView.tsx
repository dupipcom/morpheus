'use client'
import { useState, useMemo, useEffect } from "react"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Slider } from "@/components/ui/slider"
import { useSession, signIn, signOut } from "next-auth/react"
import { getWeekNumber } from "@/app/helpers"
import { Button } from "@/components/ui/button"
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel"

export const TaskView = ({ timeframe = "day", actions = [] }) => {
  const [fullDay, setFullDay] = useState(new Date()) 
  console.log({ fullDay })
  const date = fullDay.toISOString().split('T')[0]
  const year = Number(date.split('-')[0])
  const [weekNumber, setWeekNumber] = useState(getWeekNumber(fullDay)[1])
  const { data: session, update } = useSession()
  const [insight, setInsight] = useState({})

  const earnings = Object.keys(session?.user?.entries || 0).length > 0 ? timeframe === "day" ? session?.user?.entries[year]?.days[date]?.earnings?.toLocaleString() : session?.user?.entries[year]?.weeks[weekNumber]?.earnings?.toLocaleString() : 0

  const userTasks = useMemo(() => {
    if(timeframe === 'day') {
      return (session?.user?.entries && session?.user?.entries[year] && session?.user?.entries[year].days && session?.user?.entries[year].days[date] && session?.user?.entries[year].days[date].tasks) || []
    } else if (timeframe === 'week') {
      return (session?.user?.entries && session?.user?.entries[year] && session?.user?.entries[year].weeks && session?.user?.entries[year].weeks[weekNumber].tasks) || []
    }
  }, [JSON.stringify(session)]).sort((a,b) => {
    if (a.status === "Done") {
      return 1
    }
    return -1
  })


  const openDays = useMemo(() => {
    return session?.user?.entries && session?.user?.entries[year] && session?.user?.entries[year].days && Object.values(session?.user?.entries[year].days).filter((day) => {
   return day.status == "Open" })
  }, [JSON.stringify(session)])

  const openWeeks = session?.user?.entries && session?.user?.entries[year] && session?.user?.entries[year].weeks && Object.values(session?.user?.entries[year].weeks).filter((week) => {
   
   return week.status == "Open" })

  const userDone = useMemo(() => userTasks?.filter((task) => task.status === "Done").map((task) => task.name), [userTasks])
  const [values, setValues] = useState(userDone)

  const castActions = userTasks?.length ? userTasks : actions 

  const handleDone = async (values) => {
    const nextActions = userTasks?.map((action) => {
      const clonedAction = { ...action }
      if (values.includes(action.name)) {
        clonedAction.status = "Done"
      } else {
        clonedAction.status = "Open"
      }
      return clonedAction
    })
    const done = nextActions.filter((action) => action.status === "Done").map((action) => action.name)
    setValues(done)
    const response = await fetch('/api/v1/user', { method: 'POST', body: JSON.stringify({
      dayActions: timeframe === 'day' ? nextActions : undefined,
      weekActions: timeframe === 'week' ? nextActions : undefined,
      date: fullDay 
    }) })
    await updateUser()
  }

  const handleEditDay = (date) => {
    setFullDay(date)
  }

  const handleEditWeek = (date) => {
    setWeekNumber(date)
  }

  const updateUser = async () => {
    const response = await fetch('/api/v1/user', { method: 'GET' })
    const updatedUser = await response.json()
    update({ ...session, user: { ...session?.user, ...updatedUser }})
  }

  useEffect(() => {
    setValues(userDone)
  }, [userDone])

  const generateInsight = async (value, field) => {
    const response = await fetch('/api/v1/hint', { method: 'GET' }, {
  cache: 'force-cache',
  next: {
    revalidate: 86400,
    tags: ['test'],
  },
})
    const json = await response.json()
    setInsight(json.result)
  }

  useEffect(() => {
    generateInsight()
  }, [])

  if (!session?.user) {
    return <div className="my-16 w-full flex align-center justify-center">
      <Button className="m-auto"><a  href="/login">Login</a></Button>
    </div>
  }

  return <>
  <ToggleGroup value={values} onValueChange={handleDone} variant="outline" className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-8 align-center justify-center w-full m-auto" type="multiple" orientation="horizontal">
    <p className="text-center scroll-m-20 text-sm font-semibold tracking-tight mb-8">You're currently viewing the actions for: {date}</p>
   { castActions?.sort().map((action) => {
      return <ToggleGroupItem className="leading-7 m-2 text-md min-h-[40px]" value={action.name}>{action.name}</ToggleGroupItem>
    }) }
  </ToggleGroup>
               <p className="m-8 text-center">Your earnings {timeframe === "day" ? "today" : "this week"}, so far: ${earnings?.toLocaleString()}</p>
          <Carousel className="max-w-[196px] m-auto">
            <CarouselContent className="text-center w-[192px]">
              {
                timeframe === "day" ? openDays?.map((day) => {
                  return <CarouselItem className="flex flex-col">
                    <small>${day.earnings?.toLocaleString()}</small>
                    <label className="mb-4">{day.date}</label>
                    <Button className="text-md p-5 mb-2" onClick={() => handleEditDay(new Date(day.date))}>Edit day</Button>
                    <Button className="text-md p-5" >Close day</Button>
                  </CarouselItem>
                }) : openWeeks?.map((week) => {
                  return <CarouselItem className="flex flex-col">
                    <small>${week.earnings?.toLocaleString()}</small>
                    <label className="mb-4">Week {week.week}</label>
                    <Button onClick={() => handleEditWeek(new Date(week.week))} className="text-md p-5 mb-2">Edit week</Button>
                    <Button className="text-md p-5">Close week</Button>
                  </CarouselItem>
                })
              }
            </CarouselContent>
          <CarouselPrevious />
          <CarouselNext />
        </Carousel>

    <p className="mx-8 mt-8">{timeframe === "day" ? insight?.dayAnalysis : insight?.weekAnalysis }</p>
    <p className="mx-8 mt-8">{insight?.last3daysAnalysis}</p>
          <div className="flex flex-wrap justify-center">
    </div>
    </>
}