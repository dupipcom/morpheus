'use client'
import { useState, useMemo, useEffect, useContext } from "react"
import useSWR from "swr"
import { merge } from 'lodash'

import { getWeekNumber } from "@/app/helpers"

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Slider } from "@/components/ui/slider"
import { Button } from "@/components/ui/button"
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel"

import { GlobalContext } from "@/lib/contexts"
import { updateUser, generateInsight, handleCloseDates as handleCloseDatesUtil } from "@/lib/userUtils"

export const TaskView = ({ timeframe = "day", actions = [] }) => {
  const { session, setGlobalContext, ...globalContext } = useContext(GlobalContext)
  const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const today = new Date()
  const todayDate = today.toLocaleString('en-uk', { timeZone: userTimezone }).split(',')[0].split('/').reverse().join('-')
  const [fullDay, setFullDay] = useState(todayDate) 
  const date = fullDay ? new Date(fullDay).toISOString().split('T')[0] : todayDate
  const year = Number(date.split('-')[0])
  const [weekNumber, setWeekNumber] = useState(getWeekNumber(today)[1])
  const [insight, setInsight] = useState({})

  const earnings = Object.keys(session?.user?.entries || 0).length > 0 ? timeframe === "day" ? session?.user?.entries[year]?.days[date]?.earnings?.toLocaleString() : session?.user?.entries[year]?.weeks[weekNumber]?.earnings?.toLocaleString() : 0

  const userTasks = useMemo(() => {
    if(timeframe === 'day') {
      const dailyTasks = ((session?.user?.entries && session?.user?.entries[year] && session?.user?.entries[year].days && session?.user?.entries[year].days[date]) && session?.user?.entries[year].days[date]?.tasks) || []
      return merge([], session?.user?.settings?.dailyTemplate, dailyTasks)
    } else if (timeframe === 'week') {
      const weeklyTasks = (session?.user?.entries && session?.user?.entries[year] && session?.user?.entries[year].weeks) && session?.user?.entries[year].weeks[weekNumber]?.tasks || []
      return merge([], session?.user?.settings?.weeklyTemplate, weeklyTasks)
    }
  }, [JSON.stringify(session), date, weekNumber])


  const openDays = useMemo(() => {
    return session?.user?.entries && session?.user?.entries[year] && session?.user?.entries[year].days && Object.values(session?.user?.entries[year].days).filter((day) => {
   return day.status == "Open" && day.date !== date })
  }, [JSON.stringify(session), date])

  const openWeeks = session?.user?.entries && session?.user?.entries[year] && session?.user?.entries[year].weeks && Object.values(session?.user?.entries[year].weeks).filter((week) => {
   
  return week.status == "Open"  && week.week !== weekNumber  })

  const userDone = useMemo(() => userTasks?.filter((task) => task.status === "Done").map((task) => task.name), [userTasks])

  const [previousValues, setPreviousValues] = useState(userDone)
  const [values, setValues] = useState(userDone)

  const castActions = userTasks?.length ? userTasks : actions 


  const handleDone = async (values) => {
    setPreviousValues(values)
    const nextActions = userTasks?.map((action) => {
      const clonedAction = { ...action }
      if (values.includes(action.name) && (action.times - action.count) === 1) {
        clonedAction.count += 1
        clonedAction.status = "Done"
      } else if (values.includes(action.name) && (action.times - action.count) >= 1) {
        clonedAction.count += 1
      } else {
        if (!values.includes(action.name) && clonedAction.times <= clonedAction.count) {
          if (clonedAction.count > 0) {
            clonedAction.count -= 1
            clonedAction.status = "Open"
          }
        }
      }
      return clonedAction
    })
    const done = nextActions.filter((action) => action.status === "Done").map((action) => action.name)

    setValues(done)
    const response = await fetch('/api/v1/user', { method: 'POST', body: JSON.stringify({
      dayActions: timeframe === 'day' ? nextActions : undefined,
      weekActions: timeframe === 'week' ? nextActions : undefined,
      date: fullDay,
      week: weekNumber
    }) })
    await updateUser(session, setGlobalContext, globalContext)
  }

  const handleCloseDates = async (values) => {
    await handleCloseDatesUtil(values, timeframe)
    await updateUser(session, setGlobalContext, globalContext)
  }

  const handleEditDay = (date) => {
    setFullDay(date)
  }

  const handleEditWeek = (date) => {
    setWeekNumber(date)
  }

  const { data, mutate, error, isLoading } = useSWR(`/api/user`, () => updateUser(session, setGlobalContext, globalContext))

  useEffect(() => {
    setValues(userDone)
  }, [userDone])



  useEffect(() => {
    updateUser(session, setGlobalContext, globalContext)
    generateInsight(setInsight)
  }, [])

  if (!session?.user) {
    return <div className="my-16 w-full flex align-center justify-center">
      <Button className="m-auto"><a  href="/login">Login</a></Button>
    </div>
  }

  return <div className="max-w-[1200px] m-auto p-4">
      <p className="sticky top-25 truncate z-[999] text-center scroll-m-20 text-sm font-semibold tracking-tight mb-8">Editing: {timeframe === "day" ? date : `Week ${weekNumber}`}</p>
  <ToggleGroup value={values} onValueChange={handleDone} variant="outline" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 align-center justify-center w-full m-auto" type="multiple" orientation="horizontal">
   { castActions?.map((action) => {
      return <ToggleGroupItem key={`task__item--${action.name}`} className="leading-7 m-1 text-sm min-h-[40px] truncate" value={action.name}>{action.times > 1 ? `${action.count}/${action.times} ` : ''}{action.name}</ToggleGroupItem>
    }) }
  </ToggleGroup>
               <p className="m-8 text-center">Your earnings {timeframe === "day" ? "today" : "this week"}, so far: ${earnings?.toLocaleString()}</p>
          {( timeframe === "day" && openDays?.length) || (timeframe === "week" && openWeeks?.length) ? <Carousel className="max-w-[196px] m-auto">
            <CarouselContent className="text-center w-[192px]">
              {
                timeframe === "day" ? openDays?.map((day, index) => {
                  return <CarouselItem key={`task__carousel--${day.date}--${index}`} className="flex flex-col">
                    <small>${day.earnings?.toLocaleString()}</small>
                    <label className="mb-4">{day.date}</label>
                    <Button className="dark:bg-foreground text-md p-5 mb-2" onClick={() => handleEditDay(new Date(day.date))}>Edit day</Button>
                    <Button variant="outline" className="text-md p-5" onClick={() => handleCloseDates([day.date])} >Close day</Button>
                  </CarouselItem>
                }) : openWeeks?.map((week, index) => {
                  return <CarouselItem key={`task__carousel--${week.week}--${index}`} className="flex flex-col">
                    <small>${week.earnings?.toLocaleString()}</small>
                    <label className="mb-4">Week {week.week}</label>
                    <Button onClick={() => handleEditWeek(week.week)} className="text-md p-5 mb-2 dark:bg-foreground">Edit week</Button>
                    <Button variant="outline" className="text-md p-5" onClick={() => handleCloseDates([{ week: week.week, year: week.year }])}>Close week</Button>
                  </CarouselItem>
                })
              }
            </CarouselContent>
          <CarouselPrevious />
          <CarouselNext />
        </Carousel> : undefined }

    <p className="mx-8 pt-8">{timeframe === "day" ? insight?.dayAnalysis : insight?.weekAnalysis }</p>
    <p className="mx-8 pt-8">{insight?.last3daysAnalysis}</p>
          <div className="flex flex-wrap justify-center">
    </div>
    </div>
}