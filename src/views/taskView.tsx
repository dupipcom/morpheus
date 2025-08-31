'use client'
import { useState, useMemo, useEffect, useContext } from "react"
import useSWR from "swr"
import { assign } from 'lodash'

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

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

import { Badge } from "@/components/ui/badge"
import { ContactCombobox } from "@/components/ui/contact-combobox"
import { Users, X } from "lucide-react"

import { MoodView } from "@/views/moodView"

import { GlobalContext } from "@/lib/contexts"
import { useI18n } from "@/lib/contexts/i18n"
import { updateUser, generateInsight, handleCloseDates as handleCloseDatesUtil, isUserDataReady, useEnhancedLoadingState } from "@/lib/userUtils"
import { TaskViewSkeleton } from "@/components/ui/skeleton-loader"
import { ContentLoadingWrapper } from '@/components/ContentLoadingWrapper'
import { DAILY_ACTIONS, WEEKLY_ACTIONS, getLocalizedTaskNames } from "@/app/constants"

export const TaskView = ({ timeframe = "day", actions = [] }) => {
  const { session, setGlobalContext, theme } = useContext(GlobalContext)
  const { t, locale } = useI18n()
  const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const today = new Date()
  const todayDate = today.toLocaleString('en-uk', { timeZone: userTimezone }).split(',')[0].split('/').reverse().join('-')
  const todayWeekNumber = getWeekNumber(today)[1]
  const [fullDay, setFullDay] = useState(todayDate)
  const date = fullDay ? new Date(fullDay).toISOString().split('T')[0] : todayDate
  const year = Number(date.split('-')[0])
  const [weekNumber, setWeekNumber] = useState(getWeekNumber(today)[1])
  const [insight, setInsight] = useState({})
  const [contacts, setContacts] = useState([])
  const [taskContacts, setTaskContacts] = useState({})

  const earnings = Object.keys(session?.user?.entries || 0).length > 0 ? timeframe === "day" ? session?.user?.entries[year]?.days[date]?.earnings?.toFixed(2) : session?.user?.entries[year]?.weeks[weekNumber]?.earnings?.toFixed(2) : 0

  const userTasks = useMemo(() => {
    if (timeframe === 'day') {
      const noDayData = !session?.user?.entries || !session?.user?.entries[year] || !Object.keys(session?.user?.entries[year].days).length
      const dailyTasks = ((session?.user?.entries && session?.user?.entries[year] && session?.user?.entries[year].days && session?.user?.entries[year].days[date]) && session?.user?.entries[year].days[date]?.tasks) || (noDayData ? DAILY_ACTIONS : [])
      if (!session?.user?.settings?.dailyTemplate) {
        return getLocalizedTaskNames(dailyTasks, t)
      }
      return assign(getLocalizedTaskNames(session?.user?.settings?.dailyTemplate, t), getLocalizedTaskNames(dailyTasks, t), { times: 1 })
    } else if (timeframe === 'week') {
      const noWeekData = !session?.user?.entries || !session?.user?.entries[year] || !Object.keys(session?.user?.entries[year].weeks).length
      const weeklyTasks = (session?.user?.entries && session?.user?.entries[year] && session?.user?.entries[year].weeks) && session?.user?.entries[year].weeks[weekNumber]?.tasks || (noWeekData ? WEEKLY_ACTIONS : [])
      if (!session?.user?.settings?.weeklyTemplate) {
        return getLocalizedTaskNames(weeklyTasks, t)
      }
      return assign(getLocalizedTaskNames(session?.user?.settings?.weeklyTemplate, t), getLocalizedTaskNames(weeklyTasks, t), { times: 1 })
    }
  }, [JSON.stringify(session?.user?.settings), date, weekNumber, t])


  const openDays = useMemo(() => {
    return session?.user?.entries && session?.user?.entries[year] && session?.user?.entries[year].days && Object.values(session?.user?.entries[year].days).filter((day) => {
      return (day.status == "Open" && day.date !== date) || (todayDate === day.date && day.status == "Open")
    })
  }, [JSON.stringify(session), date])

  const openWeeks = useMemo(() => {
    return session?.user?.entries && session?.user?.entries[year] && session?.user?.entries[year].weeks && Object.values(session?.user?.entries[year].weeks).filter((week) => {
      return (week.status == "Open" && week.week !== weekNumber) || (todayWeekNumber === week.week && week.status == "Open")
    })
  }, [JSON.stringify(session), weekNumber])

  const userDone = useMemo(() => userTasks?.filter((task) => task.status === "Done").map((task) => task.name), [userTasks])

  // Load existing task contacts from database
  useEffect(() => {
    if (userTasks && userTasks.length > 0) {
      const existingTaskContacts = {}
      userTasks.forEach(task => {
        if (task.contacts && task.contacts.length > 0) {
          existingTaskContacts[task.name] = task.contacts
        }
      })
      setTaskContacts(existingTaskContacts)
    }
  }, [userTasks])

  const [previousValues, setPreviousValues] = useState(userDone)
  const [values, setValues] = useState(userDone)

  const castActions = useMemo(() => {
    return userTasks?.length > 0 ? userTasks : actions
  }, [userTasks, actions]).sort((a, b) => {
    if (a.status === "Done") {
      return 1
    } else if (b.status === "Done") {
      return -1
    } else {
      return a.name.localeCompare(b.name)
    }
  })

  const isMoodEmpty = useMemo(() => {
    if (session?.user?.entries && session?.user?.entries[year] && session?.user?.entries[year].days && session?.user?.entries[year].days[date]) {
      if (Object.values(session?.user?.entries[year].days[date].mood).every(value => value === 0)) {
        return true
      } else {
        return false
      }
    }
    return true
  }, [fullDay, year, date, session.user.id])


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
    const response = await fetch('/api/v1/user', {
      method: 'POST', body: JSON.stringify({
        dayActions: timeframe === 'day' ? nextActions : undefined,
        weekActions: timeframe === 'week' ? nextActions : undefined,
        taskContacts: taskContacts,
        date: fullDay,
        week: weekNumber
      })
    })
    await updateUser(session, setGlobalContext, { session, theme })
  }

  // Function to save task contacts when they are modified
  const saveTaskContacts = async (taskName: string, contacts: any[]) => {
    try {
      const payload: any = {
        taskContacts: { [taskName]: contacts }
      }
      
      // Only send the appropriate parameter based on timeframe
      if (timeframe === 'day') {
        payload.date = fullDay
      } else if (timeframe === 'week') {
        payload.week = weekNumber
      }
      
      console.log('Saving task contacts:', { taskName, contacts, payload, timeframe })
      
      const response = await fetch('/api/v1/user', {
        method: 'POST',
        body: JSON.stringify(payload)
      })
      if (response.ok) {
        console.log('Task contacts saved successfully')
        await updateUser(session, setGlobalContext, { session, theme })
      } else {
        console.error('Failed to save task contacts:', response.status, response.statusText)
      }
    } catch (error) {
      console.error('Error saving task contacts:', error)
    }
  }

  const handleCloseDates = async (values) => {
    await handleCloseDatesUtil(values, timeframe)
    await updateUser(session, setGlobalContext, { session, theme })
  }

  const handleEditDay = (date) => {
    setFullDay(date)
  }

  const handleEditWeek = (date) => {
    setWeekNumber(date)
  }

  const { data, mutate, error, isLoading } = useSWR(
    session?.user ? `/api/user` : null,
    () => updateUser(session, setGlobalContext, { session, theme })
  )

  // Fetch contacts
  const { data: contactsData, mutate: mutateContacts, isLoading: contactsLoading } = useSWR(
    session?.user ? `/api/v1/contacts` : null,
    async () => {
      const response = await fetch('/api/v1/contacts')
      if (response.ok) {
        const data = await response.json()
        setContacts(data.contacts || [])
        return data
      }
      return { contacts: [] }
    }
  )

  // Ensure contacts are loaded from SWR data
  useEffect(() => {
    if (contactsData?.contacts) {
      setContacts(contactsData.contacts)
    }
  }, [contactsData])

  useEffect(() => {
    setValues(userDone)
  }, [userDone])

  useEffect(() => {
    updateUser(session, setGlobalContext, { session, theme })
    generateInsight(setInsight, 'test', locale)
  }, [locale])

  // Use enhanced loading state to prevent flashing
  const isDataLoading = useEnhancedLoadingState(isLoading, session, 100, timeframe)

  if (isLoading) {
    return <TaskViewSkeleton />
  }

  if (!session?.user) {
    return <div className="my-16 w-full flex align-center justify-center">
      <Button className="m-auto"><a href="/app/dashboard">{t('common.login')}</a></Button>
    </div>
  }

  return <div className="max-w-[1200px] m-auto p-4">
    <p className="sticky top-25 truncate z-[999] text-center scroll-m-20 text-sm font-semibold tracking-tight mb-8">{t('tasks.editing', { timeframe: timeframe === "day" ? date : t('tasks.weekNumber', { number: weekNumber }) })} {!!earnings > 0 ? `($${earnings})` : ''}</p>
    {(timeframe === "day" && openDays?.length) || (timeframe === "week" && openWeeks?.length) ? <Carousel className="max-w-[196px] md:max-w-[380px] m-auto">
      <CarouselContent className="text-center w-[192px] my-8">
        {
          timeframe === "day" ? openDays?.map((day, index) => {
            return <CarouselItem key={`task__carousel--${day.date}--${index}`} className="flex flex-col">
              <small>${day.earnings?.toFixed(2)}</small>
              <label className="mb-4">{day.date}</label>
              <Button className="dark:bg-foreground text-md p-5 mb-2" onClick={() => handleEditDay(new Date(day.date))}>{t('common.edit')} {t('common.day').toLowerCase()}</Button>
              <Button variant="outline" className="text-md p-5" onClick={() => handleCloseDates([day.date])} >{t('common.close')} {t('common.day').toLowerCase()}</Button>
            </CarouselItem>
          }) : openWeeks?.map((week, index) => {
            return <CarouselItem key={`task__carousel--${week.week}--${index}`} className="flex flex-col">
              <small>${week.earnings.toFixed(2)}</small>
              <label className="mb-4">{t('week.weekNumber', { number: week.week })}</label>
              <Button onClick={() => handleEditWeek(week.week)} className="text-md p-5 mb-2 dark:bg-foreground">{t('common.edit')} {t('common.week').toLowerCase()}</Button>
              <Button variant="outline" className="text-md p-5" onClick={() => handleCloseDates([{ week: week.week, year: week.year }])}>{t('common.close')} {t('common.week').toLowerCase()}</Button>
            </CarouselItem>
          })
        }
      </CarouselContent>
      <CarouselPrevious />
      <CarouselNext />
    </Carousel> : undefined}
    <Accordion key={`mood__accordion--${isMoodEmpty}`} type="single" collapsible defaultValue={isMoodEmpty ? "mood" : "tasks"}>
      {timeframe === "day" && <AccordionItem value="mood">
        <AccordionTrigger>{t('common.mood')}</AccordionTrigger>
        <AccordionContent>
          <div className="flex flex-col max-w-[720px] m-auto">
            <MoodView timeframe={timeframe} date={fullDay} />
          </div>
        </AccordionContent>
      </AccordionItem>}
      <AccordionItem value="tasks">
        <AccordionTrigger>{t('dashboard.whatDidYouAccomplish')}</AccordionTrigger>
        <AccordionContent>
          <div className="flex flex-col">
          <ToggleGroup value={values} onValueChange={handleDone} variant="outline" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 align-center justify-center w-full m-auto" type="multiple" orientation="horizontal">
      {castActions?.map((action) => {
        const taskContactRefs = taskContacts[action.name] || []
        return (
          <div key={`task__item--${action.name}`} className="flex flex-col items-center m-1">
            <div className="relative w-full">
              <ToggleGroupItem className="rounded-md leading-7 text-sm min-h-[40px] truncate w-full" value={action.name}>
                {action.times > 1 ? `${action.count}/${action.times} ` : ''}{action.displayName || action.name}
              </ToggleGroupItem>
              
              {/* Contact Management Popover */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="bg-muted absolute top-1/2 right-1 transform -translate-y-1/2 h-6 w-6 p-0 rounded-full"
                  >
                    <Users className="h-3 w-3" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 bg-transparent border-none">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">{t('social.addContactsToTask', { taskName: action.displayName || action.name })}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {!contactsLoading && (
                        <ContactCombobox
                          contacts={contacts}
                          selectedContacts={taskContactRefs}
                          onContactsChange={(newContacts) => {
                            setTaskContacts(prev => ({
                              ...prev,
                              [action.name]: newContacts
                            }))
                            // Save the updated contacts to the database
                            saveTaskContacts(action.name, newContacts)
                          }}
                          onContactsRefresh={() => {
                            // Trigger a refresh of the contacts data
                            mutateContacts()
                          }}
                        />
                      )}
                      
                      {/* Interaction Quality Sliders for Selected Contacts */}
                      {taskContactRefs.length > 0 && (
                        <div className="mt-4 space-y-3">
                          <h4 className="text-sm font-medium text-muted-foreground">Interaction Quality Ratings</h4>
                          {taskContactRefs.map((contact) => (
                            <div key={contact.id} className="space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-medium">{contact.name}</span>
                                <span className="text-xs text-muted-foreground">{contact.interactionQuality || 3}/5</span>
                              </div>
                              <Slider
                                value={[contact.interactionQuality || 3]}
                                onValueChange={(value) => {
                                  const updatedContacts = taskContactRefs.map(c => 
                                    c.id === contact.id 
                                      ? { ...c, interactionQuality: value[0] }
                                      : c
                                  )
                                  setTaskContacts(prev => ({
                                    ...prev,
                                    [action.name]: updatedContacts
                                  }))
                                  // Save the updated contacts to the database
                                  saveTaskContacts(action.name, updatedContacts)
                                }}
                                max={5}
                                min={0}
                                step={0.5}
                                className="w-full"
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </PopoverContent>
              </Popover>
            </div>

            {/* Contact Badges */}
            {taskContactRefs.length > 0 && (
              <div className="flex flex-wrap gap-1 justify-center mt-1">
                {taskContactRefs.map((contact) => (
                  <Badge
                    key={contact.id}
                    variant="outline"
                    className="text-xs px-1 py-0 h-4"
                  >
                    {contact.name}
                    {contact.interactionQuality && (
                      <span className="ml-1 text-xs">
                        {contact.interactionQuality}/5
                      </span>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-3 w-3 p-0 ml-1 hover:bg-transparent"
                      onClick={(e) => {
                        e.stopPropagation()
                        const updatedContacts = taskContacts[action.name].filter(c => c.id !== contact.id)
                        setTaskContacts(prev => ({
                          ...prev,
                          [action.name]: updatedContacts
                        }))
                        // Save the updated contacts to the database
                        saveTaskContacts(action.name, updatedContacts)
                      }}
                    >
                      <X className="h-2 w-2" />
                    </Button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </ToggleGroup>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
    <p className="m-8 text-center">{t('tasks.yourEarnings', { timeframe: timeframe === "day" ? t('dashboard.today') : t('dashboard.thisWeek'), amount: earnings?.toLocaleString() })}</p>


    <p className="mx-8 pt-8">{timeframe === "day" ? insight?.dayAnalysis : insight?.weekAnalysis}</p>
    <p className="mx-8 pt-8">{insight?.last3daysAnalysis}</p>
    <div className="flex flex-wrap justify-center">
    </div>
    <Button 
      variant="outline" 
      className="text-md p-5 m-auto w-full my-8" 
      onClick={() => {
        if (timeframe === "day") {
          handleCloseDates([date])
        } else {
          handleCloseDates([{ week: weekNumber, year: year }])
        }
      }}
    >
      {timeframe === "day" ? t('mood.closeDay') : t('week.closeWeek')}
    </Button>
  </div >
}