'use client'
import { useState, useEffect, useMemo } from 'react'

import { Slider } from "@/components/ui/slider"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { getWeekNumber } from "@/app/helpers"
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel"

export const MoodView = ({ timeframe = "day" }) => {
  const [fullDay, setFullDay] = useState(new Date()) 
  const date = fullDay.toISOString().split('T')[0]
  const year = Number(date.split('-')[0])
  const [weekNumber, setWeekNumber] = useState(getWeekNumber(fullDay)[1])

  const [session, setSession] = useState({ user: {} })

  const [insight, setInsight] = useState({})

  const serverMood = useMemo(() => (session?.user?.entries && session?.user?.entries[year] && session?.user?.entries[year].days && session?.user?.entries[year].days[date] && session?.user?.entries[year].days[date].mood) || {}, [fullDay, JSON.stringify(session)])

  const serverText = useMemo(() => (session?.user?.entries && session?.user?.entries[year] && session?.user?.entries[year].days && session?.user?.entries[year].days[date] && session?.user?.entries[year].days[date].text) || "", [fullDay, JSON.stringify(session)])

  const openDays = useMemo(() => {
    return session?.user?.entries && session?.user?.entries[year] && session?.user?.entries[year].days && Object.values(session?.user?.entries[year].days).filter((day) => {
   return day.status == "Open" })
  }, [JSON.stringify(session)])

  const [mood, setMood] = useState(serverMood)

  const updateUser = async () => {
    const response = await fetch('/api/v1/user', { method: 'GET' })
    const updatedUser = await response.json()
    setSession({...session, user: updatedUser })
  }

  const handleSubmit = async (value, field) => {
    setMood({...mood, [field]: value})

    if (field === 'text') {
      const response = await fetch('/api/v1/user', 
      { method: 'POST', 
        body: JSON.stringify({
          text: value,
          date: fullDay
      }) 
    })
    } else {
      const response = await fetch('/api/v1/user', 
      { method: 'POST', 
        body: JSON.stringify({
          mood: {
            [field]: value,
          },
          date: fullDay
        }) 
      })
    }
    await updateUser()
  }



  const handleEditDay = (date) => {
    setFullDay(date)
  }

  const handleCloseDates = async (values) => {
    const response = await fetch('/api/v1/user', { method: 'POST', body: JSON.stringify({
      daysToClose: values,
      date: fullDay 
    }) })
    await updateUser()
  }

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
    updateUser()
    generateInsight()
  }, [])

  if (!session?.user) {
    return <div className="my-16 w-full flex align-center justify-center">
      <Button className="m-auto"><a  href="/login">Login</a></Button>
    </div>
  }

  return <div key={JSON.stringify(serverMood)} className="max-w-[720px] m-auto">
    <p className="text-center scroll-m-20 text-sm font-semibold tracking-tight mb-8">You're currently viewing the mood for: {date}</p>
          <h3 className="mt-8 mb-4">What's in your mind?</h3>
      <Textarea defaultValue={serverText} onBlur={(e) => handleSubmit(e.target.value, "text")} />
      <div className="my-8">
        <h3 className="mt-8 mb-4">Gratitude</h3>
        <small>{insight?.gratitudeAnalysis}</small>
      </div>
      <Slider defaultValue={[serverMood.gratitude || 0]} max={5} step={1} onValueCommit={(e) => handleSubmit(e[0], "gratitude")} />
      <div className="my-8">
        <h3 className="mt-8 mb-4">Optimism</h3>
        <small>{insight?.optimismAnalysis}</small>
      </div>
      <Slider defaultValue={[serverMood.optimism || 0]} max={5} step={1} onValueCommit={(e) => handleSubmit(e[0], "optimism")} />
      <div className="my-8">
        <h3 className="mt-8 mb-4">Restedness</h3>
        <small>{insight?.restednessAnalysis}</small>
      </div>
      <Slider defaultValue={[serverMood.restedness || 0]} max={5} step={1} onValueCommit={(e) => handleSubmit(e[0], "restedness")} />
      <div className="my-8">
        <h3 className="mt-8 mb-4">Tolerance</h3>
        <small>{insight?.toleranceAnalysis}</small>
      </div>
      <Slider defaultValue={[serverMood.tolerance || 0]} max={5} step={1} onValueCommit={(e) => handleSubmit(e[0], "tolerance")} />
      <div className="my-8">
        <h3 className="mt-8 mb-4">Self-Esteem</h3>
        <small>{insight?.selfEsteemAnalysis}</small>
      </div>
      <Slider defaultValue={[serverMood.selfEsteem || 0]} max={5} step={1} onValueCommit={(e) => handleSubmit(e[0], "selfEsteem")} />
      <div className="my-8">
        <h3 className="mt-8 mb-4">Trust</h3>
        <small>{insight?.trustAnalysis}</small>
      </div>
      <Slider className="mb-16" defaultValue={[serverMood?.trust || 0]} max={5} step={1} onValueCommit={(e) => handleSubmit(e[0], "trust")} />
        <Carousel className="max-w-[196px] m-auto">
            <CarouselContent className="text-center w-[192px]">
              {
                openDays?.map((day) => {
                  return <CarouselItem className="flex flex-col">
                    <small>${day.earnings?.toLocaleString()}</small>
                    <label className="mb-4">{day.date}</label>
                    <Button className="text-md p-5 mb-2" onClick={() => handleEditDay(new Date(day.date))}>Edit day</Button>
                    <Button className="text-md p-5" onClick={() => handleCloseDates([day.date])}>Close day</Button>
                  </CarouselItem>
                })
              }
            </CarouselContent>
          <CarouselPrevious />
          <CarouselNext />
        </Carousel>
    </div>
}