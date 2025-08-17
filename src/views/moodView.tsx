'use client'
import { useState, useEffect, useMemo, useContext } from 'react'

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
import { GlobalContext } from "@/lib/contexts"
import { useI18n } from "@/lib/contexts/i18n"
import { updateUser, generateInsight, handleCloseDates as handleCloseDatesUtil, handleMoodSubmit, isUserDataReady, useEnhancedLoadingState } from "@/lib/userUtils"
import { MoodViewSkeleton } from "@/components/ui/skeleton-loader"

export const MoodView = ({ timeframe = "day" }) => {
  const { session, setGlobalContext, theme } = useContext(GlobalContext)
  const { t, locale } = useI18n()
  const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const today = new Date()
  const todayDate = today.toLocaleString('en-uk', { timeZone: userTimezone }).split(',')[0].split('/').reverse().join('-')
  const [fullDay, setFullDay] = useState(todayDate) 
  const date = fullDay ? new Date(fullDay).toISOString().split('T')[0] : todayDate
  const year = Number(date.split('-')[0])
  const [weekNumber, setWeekNumber] = useState(getWeekNumber(today)[1])

  const [insight, setInsight] = useState({})

  const serverMood = useMemo(() => (session?.user?.entries && session?.user?.entries[year] && session?.user?.entries[year].days && session?.user?.entries[year].days[date] && session?.user?.entries[year].days[date].mood) || {}, [fullDay, JSON.stringify(session)])

  const serverText = useMemo(() => (session?.user?.entries && session?.user?.entries[year] && session?.user?.entries[year].days && session?.user?.entries[year].days[date] && session?.user?.entries[year].days[date].text) || "", [fullDay, JSON.stringify(session)])

  const openDays = useMemo(() => {
    return session?.user?.entries && session?.user?.entries[year] && session?.user?.entries[year].days && Object.values(session?.user?.entries[year].days).filter((day) => {
   return day.status === "Open" && day.date !== date }).sort()
  }, [JSON.stringify(session), date])

  const [mood, setMood] = useState(serverMood)



  const handleSubmit = async (value, field) => {
    setMood({...mood, [field]: value})
    await handleMoodSubmit(value, field, fullDay)
    await updateUser(session, setGlobalContext, { session, theme })
  }



  const handleEditDay = (date) => {
    setFullDay(date)
  }

  const handleCloseDates = async (values) => {
    await handleCloseDatesUtil(values, undefined, fullDay)
    await updateUser(session, setGlobalContext, { session, theme })
  }



  useEffect(() => {
    updateUser(session, setGlobalContext, { session, theme })
    generateInsight(setInsight, 'test', locale)
  }, [locale])

  // Use enhanced loading state to prevent flashing (moodView doesn't use SWR)
  const isDataLoading = useEnhancedLoadingState(false, session)

  if (isDataLoading) {
    return <MoodViewSkeleton />
  }

  return <div key={JSON.stringify(serverMood)} className="max-w-[720px] m-auto p-4">
          <p className="sticky top-25 truncate z-[999] text-center scroll-m-20 text-sm font-semibold tracking-tight mb-8">{t('tasks.editing', { timeframe: date })}</p>
          <h3 className="mt-8 mb-4">What's in your mind?</h3>
      <Textarea className="mb-16" defaultValue={serverText} onBlur={(e) => handleSubmit(e.target.value, "text")} />
      <div className="my-12">
        <h3 className="mt-8 mb-4">Gratitude</h3>
        <small>{insight?.gratitudeAnalysis}</small>
      </div>
      <Slider className="mb-24" defaultValue={[serverMood.gratitude || 0]} max={5} step={0.5} onValueCommit={(e) => handleSubmit(e[0], "gratitude")} />
      <div className="my-12">
        <h3 className="mt-8 mb-4">Optimism</h3>
        <small>{insight?.optimismAnalysis}</small>
      </div>
      <Slider className="mb-24" defaultValue={[serverMood.optimism || 0]} max={5} step={0.5} onValueCommit={(e) => handleSubmit(e[0], "optimism")} />
      <div className="my-12">
        <h3 className="mt-8 mb-4">Restedness</h3>
        <small>{insight?.restednessAnalysis}</small>
      </div>
      <Slider className="mb-24" defaultValue={[serverMood.restedness || 0]} max={5} step={0.5} onValueCommit={(e) => handleSubmit(e[0], "restedness")} />
      <div className="my-12">
        <h3 className="mt-8 mb-4">Tolerance</h3>
        <small>{insight?.toleranceAnalysis}</small>
      </div>
      <Slider className="mb-24" defaultValue={[serverMood.tolerance || 0]} max={5} step={0.5} onValueCommit={(e) => handleSubmit(e[0], "tolerance")} />
      <div className="my-12">
        <h3 className="mb-4">{t('mood.selfEsteem')}</h3>
        <small>{insight?.selfEsteemAnalysis}</small>
      </div>
      <Slider className="mb-24" defaultValue={[serverMood.selfEsteem || 0]} max={5} step={0.5} onValueCommit={(e) => handleSubmit(e[0], "selfEsteem")} />
      <div className="my-12">
        <h3 className="mt-8 mb-4">{t('mood.trust')}</h3>
        <small>{insight?.trustAnalysis}</small>
      </div>
      <Slider className="mb-24" defaultValue={[serverMood?.trust || 0]} max={5} step={0.5} onValueCommit={(e) => handleSubmit(e[0], "trust")} />
        {openDays?.length ? <Carousel className="max-w-[196px] m-auto">
            <CarouselContent className="text-center w-[192px]">
              {
                openDays?.map((day) => {
                  return <CarouselItem className="flex flex-col">
                    <small>${day.earnings?.toLocaleString()}</small>
                    <label className="mb-4">{day.date}</label>
                    <Button className="text-md p-5 mb-2 dark:bg-foreground" onClick={() => handleEditDay(new Date(day.date))}>{t('mood.editDay')}</Button>
                    <Button variant="outline" className="text-md p-5" onClick={() => handleCloseDates([day.date])}>{t('mood.closeDay')}</Button>
                  </CarouselItem>
                })
              }
            </CarouselContent>
          <CarouselPrevious />
          <CarouselNext />
        </Carousel> : undefined }
    </div>
}