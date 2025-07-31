'use client'
import { useState, useMemo, useEffect } from "react"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Slider } from "@/components/ui/slider"
import { useSession, signIn, signOut } from "next-auth/react"
import { getWeekNumber } from "@/app/helpers"

export const TaskView = ({ timeframe = "day", actions = [] }) => {
  const fullDate = new Date()
  const date = fullDate.toISOString().split('T')[0]
  const year = Number(date.split('-')[0])
  const weekNumber = getWeekNumber(fullDate)[1]
  const { data: session, update } = useSession()
  const [insight, setInsight] = useState({})

  const earnings = timeframe === "day" ? session?.user?.entries[year]?.days[date]?.earnings?.toLocaleString() : session?.user?.entries[year]?.weeks[weekNumber]?.earnings?.toLocaleString()

  const userTasks = useMemo(() => {
    if(timeframe === 'day') {
      return (session?.user?.entries && session?.user?.entries[year] && session?.user?.entries[year].days && session?.user?.entries[year].days[date] && session?.user?.entries[year].days[date].tasks) || []
    } else if (timeframe === 'week') {
      return (session?.user?.entries && session?.user?.entries[year] && session?.user?.entries[year].weeks && session?.user?.entries[year].weeks[weekNumber].tasks) || []
    }
  }, [JSON.stringify(session)])

  const userDone = useMemo(() => userTasks?.filter((task) => task.status === "Done").map((task) => task.name), [userTasks])
  const [values, setValues] = useState(userDone)

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
      weekActions: timeframe === 'week' ? nextActions : undefined 
    }) })
    await updateUser()
  }

  const updateUser = async () => {
    const response = await fetch('/api/v1/user', { method: 'GET' })
    const updatedUser = await response.json()
    console.log({ updatedUser })
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

  return <>
  <ToggleGroup value={values} onValueChange={handleDone} variant="outline" className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-8 align-center justify-center w-full m-auto" type="multiple" orientation="horizontal">
   { actions.map((action) => {
      return <ToggleGroupItem className="leading-7 m-2" value={action.name}>{action.name}</ToggleGroupItem>
    }) }
  </ToggleGroup>
    <p className="m-8">{timeframe === "day" ? insight.dayAnalysis : insight.weekAnalysis }</p>
    <p className="m-8">{insight.last3daysAnalysis}</p>
           <p className="m-8 text-center">Your earnings {timeframe === "day" ? "today" : "this week"}, so far: ${earnings}</p>
    </>
}