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
import { ThingCombobox } from "@/components/ui/thing-combobox"
import { Users, X, Heart, Settings, Package, Plus } from "lucide-react"
import { Switch } from "@/components/ui/switch"

import { MoodView } from "@/views/moodView"

import { GlobalContext } from "@/lib/contexts"
import { useI18n } from "@/lib/contexts/i18n"
import { updateUser, generateInsight, handleCloseDates as handleCloseDatesUtil, isUserDataReady, useEnhancedLoadingState, handleMoodSubmit } from "@/lib/userUtils"
import { TaskViewSkeleton } from "@/components/ui/skeleton-loader"
import { ContentLoadingWrapper } from '@/components/ContentLoadingWrapper'
import { DAILY_ACTIONS, WEEKLY_ACTIONS, getLocalizedTaskNames } from "@/app/constants"
import { useDebounce } from "@/lib/hooks/useDebounce"

import { useFeatureFlag } from "@/lib/hooks/useFeatureFlag"

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

  const serverText = useMemo(() => (session?.user?.entries && session?.user?.entries[year] && session?.user?.entries[year].days && session?.user?.entries[year].days[date] && session?.user?.entries[year].days[date].text) || "", [fullDay, JSON.stringify(session)])

  const [weekNumber, setWeekNumber] = useState(getWeekNumber(today)[1])
  const [insight, setInsight] = useState({})
  const [contacts, setContacts] = useState([])
  const [things, setThings] = useState([])
  const [currentText, setCurrentText] = useState(serverText)
  const [taskContacts, setTaskContacts] = useState({})
  const [taskThings, setTaskThings] = useState({})
  const [favorites, setFavorites] = useState(new Set())
  const [optimisticFavorites, setOptimisticFavorites] = useState(new Set())
  const [ephemeralTasks, setEphemeralTasks] = useState([])
  const [showAddEphemeral, setShowAddEphemeral] = useState(false)
  const [newEphemeralTask, setNewEphemeralTask] = useState({ name: '', area: 'self', category: 'custom', saveToTemplate: false })

  // Load ephemeral tasks from session
  const currentEphemeralTasks = useMemo(() => {
    if (timeframe === 'day') {
      return session?.user?.entries?.[year]?.days?.[date]?.ephemeralTasks || []
    } else if (timeframe === 'week') {
      return session?.user?.entries?.[year]?.weeks?.[weekNumber]?.ephemeralTasks || []
    }
    return []
  }, [session?.user?.entries, year, date, weekNumber, timeframe])
  const { isAgentChatEnabled } = useFeatureFlag()
  const messages = session?.user?.entries && session?.user?.entries[year] && session?.user?.entries[year].weeks && session?.user?.entries[year]?.weeks[weekNumber] && session?.user?.entries[year]?.weeks[weekNumber].messages
  const reverseMessages = useMemo (() => messages?.length ? messages.sort((a,b) => new Date(a.timestamp).getTime() > new Date(b.timestamp).getTime() ? 1 : -1) : [], [JSON.stringify(session?.user)])
  
  const earnings = Object.keys(session?.user?.entries || 0).length > 0 ? timeframe === "day" ? session?.user?.entries[year]?.days[date]?.earnings?.toFixed(2) : session?.user?.entries[year]?.weeks[weekNumber]?.earnings?.toFixed(2) : 0



  const userTasks = useMemo(() => {
    let regularTasks = []
    
    if (timeframe === 'day') {
      const noDayData = !session?.user?.entries || !session?.user?.entries[year] || !Object.keys(session?.user?.entries[year].days).length
      const dailyTasks = ((session?.user?.entries && session?.user?.entries[year] && session?.user?.entries[year].days && session?.user?.entries[year].days[date]) && session?.user?.entries[year].days[date]?.tasks) || (noDayData ? DAILY_ACTIONS : [])
      
      // Always prioritize dailyTemplate if it exists, otherwise use dailyTasks
      if (session?.user?.settings?.dailyTemplate && session?.user?.settings?.dailyTemplate.length > 0) {
        regularTasks = assign(getLocalizedTaskNames(session?.user?.settings?.dailyTemplate, t), getLocalizedTaskNames(dailyTasks, t), { times: 1 })
      } else {
        regularTasks = getLocalizedTaskNames(dailyTasks, t)
      }
    } else if (timeframe === 'week') {
      const noWeekData = !session?.user?.entries || !session?.user?.entries[year] || !Object.keys(session?.user?.entries[year].weeks).length
      const weeklyTasks = (session?.user?.entries && session?.user?.entries[year] && session?.user?.entries[year].weeks) && session?.user?.entries[year].weeks[weekNumber]?.tasks || []
      
      // Always prioritize weeklyTemplate if it exists, otherwise use weeklyTasks or default actions
      if (session?.user?.settings?.weeklyTemplate && session?.user?.settings?.weeklyTemplate.length > 0) {
        regularTasks = assign(getLocalizedTaskNames(session?.user?.settings?.weeklyTemplate, t), getLocalizedTaskNames(weeklyTasks, t), { times: 1 })
      } else {
        regularTasks = getLocalizedTaskNames(weeklyTasks.length > 0 ? weeklyTasks : WEEKLY_ACTIONS, t)
      }
    }
    
    // Combine regular tasks with ephemeral tasks
    const ephemeralTasksWithDisplayName = currentEphemeralTasks.map(task => ({
      ...task,
      displayName: task.name,
      isEphemeral: true
    }))
    
    return [...regularTasks, ...ephemeralTasksWithDisplayName]
  }, [JSON.stringify(session?.user?.settings), date, weekNumber, t, currentEphemeralTasks])


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
      const existingTaskThings = {}
      userTasks.forEach(task => {
        if (task.contacts && task.contacts.length > 0) {
          existingTaskContacts[task.name] = task.contacts
        }
        if (task.things && task.things.length > 0) {
          existingTaskThings[task.name] = task.things
        }
      })
      setTaskContacts(existingTaskContacts)
      setTaskThings(existingTaskThings)
    }
  }, [userTasks])

  // Load favorites from user settings
  useEffect(() => {
    if (session?.user?.settings) {
      const template = timeframe === 'day' 
        ? session.user.settings.dailyTemplate 
        : session.user.settings.weeklyTemplate
      
      if (template && Array.isArray(template)) {
        const favoriteSet = new Set()
        template.forEach(item => {
          if (typeof item === 'object' && item.favorite) {
            favoriteSet.add(item.name)
          } else if (typeof item === 'string') {
            // Handle legacy string format
            favoriteSet.add(item)
          }
        })
        setFavorites(favoriteSet)
        setOptimisticFavorites(favoriteSet)
      }
    }
  }, [session?.user?.settings, timeframe])

  const [previousValues, setPreviousValues] = useState(userDone)
  const [values, setValues] = useState(userDone)

  const castActions = useMemo(() => {
    const tasks = userTasks?.length > 0 ? userTasks : actions
    return tasks.sort((a, b) => {
      const aIsDone = a.status === "Done"
      const bIsDone = b.status === "Done"
      const aIsFavorite = optimisticFavorites.has(a.name)
      const bIsFavorite = optimisticFavorites.has(b.name)
      
      // Priority order:
      // 1. not done favorite tasks
      // 2. not done non-favorite tasks  
      // 3. done favorite tasks
      // 4. done non-favorite tasks
      
      // If both are not done
      if (!aIsDone && !bIsDone) {
        if (aIsFavorite && !bIsFavorite) return -1 // a (favorite) comes first
        if (!aIsFavorite && bIsFavorite) return 1  // b (favorite) comes first
        return a.name.localeCompare(b.name) // alphabetical if both have same favorite status
      }
      
      // If both are done
      if (aIsDone && bIsDone) {
        if (aIsFavorite && !bIsFavorite) return -1 // a (favorite) comes first
        if (!aIsFavorite && bIsFavorite) return 1  // b (favorite) comes first
        return a.name.localeCompare(b.name) // alphabetical if both have same favorite status
      }
      
      // If one is done and one is not done
      if (!aIsDone && bIsDone) return -1 // not done comes first
      if (aIsDone && !bIsDone) return 1  // not done comes first
      
      return 0
    })
  }, [userTasks, actions, optimisticFavorites])

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
    
    // Separate regular tasks from ephemeral tasks
    const regularTasks = userTasks?.filter(task => !task.isEphemeral) || []
    const ephemeralTasks = userTasks?.filter(task => task.isEphemeral) || []
    
    // Handle regular tasks
    const nextActions = regularTasks?.map((action) => {
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
    
    // Handle ephemeral tasks
    const updatedEphemeralTasks = ephemeralTasks?.map((task) => {
      const clonedTask = { ...task }
      if (values.includes(task.name) && (task.times - task.count) === 1) {
        clonedTask.count += 1
        clonedTask.status = "Done"
      } else if (values.includes(task.name) && (task.times - task.count) >= 1) {
        clonedTask.count += 1
      } else {
        if (!values.includes(task.name) && clonedTask.times <= clonedTask.count) {
          if (clonedTask.count > 0) {
            clonedTask.count -= 1
            clonedTask.status = "Open"
          }
        }
      }
      return clonedTask
    })
    
    const done = [...(nextActions || []), ...(updatedEphemeralTasks || [])].filter((action) => action.status === "Done").map((action) => action.name)

    setValues(done)
    
    // Update regular tasks
    if (nextActions && nextActions.length > 0) {
      const response = await fetch('/api/v1/user', {
        method: 'POST', body: JSON.stringify({
          dayActions: timeframe === 'day' ? nextActions : undefined,
          weekActions: timeframe === 'week' ? nextActions : undefined,
          taskContacts: taskContacts,
          taskThings: taskThings,
          date: fullDay,
          week: weekNumber
        })
      })
    }
    
    // Update ephemeral tasks
    if (updatedEphemeralTasks && updatedEphemeralTasks.length > 0) {
      for (const task of updatedEphemeralTasks) {
        const response = await fetch('/api/v1/user', {
          method: 'POST', body: JSON.stringify({
            [timeframe === 'day' ? 'dayEphemeralTasks' : 'weekEphemeralTasks']: {
              update: {
                id: task.id,
                updates: {
                  status: task.status,
                  count: task.count
                }
              }
            },
            date: fullDay,
            week: weekNumber
          })
        })
      }
    }
    
    await updateUser(session, setGlobalContext, { session, theme })
  }

  // Create debounced version that only handles server requests
  const debouncedServerUpdate = useDebounce(async (values) => {
    setPreviousValues(values)
    
    // Separate regular tasks from ephemeral tasks
    const regularTasks = userTasks?.filter(task => !task.isEphemeral) || []
    const ephemeralTasks = userTasks?.filter(task => task.isEphemeral) || []
    
    // Handle regular tasks
    const nextActions = regularTasks?.map((action) => {
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
    
    // Handle ephemeral tasks
    const updatedEphemeralTasks = ephemeralTasks?.map((task) => {
      const clonedTask = { ...task }
      if (values.includes(task.name) && (task.times - task.count) === 1) {
        clonedTask.count += 1
        clonedTask.status = "Done"
      } else if (values.includes(task.name) && (task.times - task.count) >= 1) {
        clonedTask.count += 1
      } else {
        if (!values.includes(task.name) && clonedTask.times <= clonedTask.count) {
          if (clonedTask.count > 0) {
            clonedTask.count -= 1
            clonedTask.status = "Open"
          }
        }
      }
      return clonedTask
    })

    // Update regular tasks
    if (nextActions && nextActions.length > 0) {
      const response = await fetch('/api/v1/user', {
        method: 'POST', body: JSON.stringify({
          dayActions: timeframe === 'day' ? nextActions : undefined,
          weekActions: timeframe === 'week' ? nextActions : undefined,
          taskContacts: taskContacts,
          taskThings: taskThings,
          date: fullDay,
          week: weekNumber
        })
      })
    }
    
    // Update ephemeral tasks
    if (updatedEphemeralTasks && updatedEphemeralTasks.length > 0) {
      for (const task of updatedEphemeralTasks) {
        const response = await fetch('/api/v1/user', {
          method: 'POST', body: JSON.stringify({
            [timeframe === 'day' ? 'dayEphemeralTasks' : 'weekEphemeralTasks']: {
              update: {
                id: task.id,
                updates: {
                  status: task.status,
                  count: task.count
                }
              }
            },
            date: fullDay,
            week: weekNumber
          })
        })
      }
    }
    
    await updateUser(session, setGlobalContext, { session, theme })
  }, 2000)

  // Handle immediate UI updates and trigger debounced server update
  const handleDoneWithDebounce = (values) => {
    // Update UI state immediately for responsive feedback
    setValues(values)
    
    // Trigger debounced server update with the current values
    debouncedServerUpdate(values)
  }

  // Create debounced version that only handles server requests for favorites
  const debouncedFavoriteServerUpdate = useDebounce(async (currentOptimisticFavorites) => {
    // Save to database with the passed optimistic favorites state
    try {
      const currentTemplate = timeframe === 'day' 
        ? session?.user?.settings?.dailyTemplate || []
        : session?.user?.settings?.weeklyTemplate || []
      
      // Update template items with favorite flags based on the passed state
      const updatedTemplate = currentTemplate.map(item => {
        const itemName = typeof item === 'string' ? item : item.name
        return {
          ...(typeof item === 'object' ? item : { name: item }),
          favorite: currentOptimisticFavorites.has(itemName)
        }
      })
      
      const payload = {
        settings: {
          [timeframe === 'day' ? 'dailyTemplate' : 'weeklyTemplate']: updatedTemplate
        }
      }
      
      const response = await fetch('/api/v1/user', {
        method: 'POST',
        body: JSON.stringify(payload)
      })
      
      if (response.ok) {
        // Update the actual favorites state on success
        setFavorites(currentOptimisticFavorites)
        await updateUser(session, setGlobalContext, { session, theme })
      } else {
        console.error('Failed to save favorites:', response.status, response.statusText)
        // Revert optimistic state on error
        setOptimisticFavorites(favorites)
      }
    } catch (error) {
      console.error('Error saving favorites:', error)
      // Revert optimistic state on error
      setOptimisticFavorites(favorites)
    }
  }, 2000)

  // Handle immediate UI updates and trigger debounced server update
  const handleToggleFavorite = (actionName) => {
    // Update optimistic UI state immediately for responsive feedback
    const newOptimisticFavorites = new Set(optimisticFavorites)
    
    if (newOptimisticFavorites.has(actionName)) {
      newOptimisticFavorites.delete(actionName)
    } else {
      newOptimisticFavorites.add(actionName)
    }
    
    setOptimisticFavorites(newOptimisticFavorites)
    
    // Trigger debounced server update with the current state
    debouncedFavoriteServerUpdate(newOptimisticFavorites)
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
      
      const response = await fetch('/api/v1/user', {
        method: 'POST',
        body: JSON.stringify(payload)
      })
      if (response.ok) {
        await updateUser(session, setGlobalContext, { session, theme })
      } else {
        console.error('Failed to save task contacts:', response.status, response.statusText)
      }
    } catch (error) {
      console.error('Error saving task contacts:', error)
    }
  }

  // Function to save task things when they are modified
  const saveTaskThings = async (taskName: string, things: any[]) => {
    try {
      const payload: any = {
        taskThings: { [taskName]: things }
      }
      
      // Only send the appropriate parameter based on timeframe
      if (timeframe === 'day') {
        payload.date = fullDay
      } else if (timeframe === 'week') {
        payload.week = weekNumber
      }
      
      const response = await fetch('/api/v1/user', {
        method: 'POST',
        body: JSON.stringify(payload)
      })
      if (response.ok) {
        await updateUser(session, setGlobalContext, { session, theme })
      } else {
        console.error('Failed to save task things:', response.status, response.statusText)
      }
    } catch (error) {
      console.error('Error saving task things:', error)
    }
  }

  // Create debounced version of saveTaskContacts for sliders
  const debouncedSaveTaskContacts = useDebounce(saveTaskContacts, 300)

  // Create debounced version of saveTaskThings for sliders
  const debouncedSaveTaskThings = useDebounce(saveTaskThings, 300)

  // Function to add ephemeral task or template task
  const addEphemeralTask = async (taskData) => {
    try {
      let payload = {}
      
      if (taskData.saveToTemplate) {
        // Add to template instead of ephemeral tasks
        const newTask = {
          name: taskData.name,
          area: taskData.area,
          categories: [taskData.category],
          cadence: timeframe,
          status: "Not started",
          times: 1,
          count: 0
        }
        
        const currentTemplate = timeframe === 'day' 
          ? session?.user?.settings?.dailyTemplate || []
          : session?.user?.settings?.weeklyTemplate || []
        
        payload = {
          settings: {
            [timeframe === 'day' ? 'dailyTemplate' : 'weeklyTemplate']: [...currentTemplate, newTask]
          }
        }
      } else {
        // Add as ephemeral task
        payload = {
          [timeframe === 'day' ? 'dayEphemeralTasks' : 'weekEphemeralTasks']: {
            add: {
              name: taskData.name,
              area: taskData.area,
              categories: [taskData.category],
              status: "Not started",
              times: 1,
              count: 0
            }
          }
        }
        
        if (timeframe === 'day') {
          payload.date = fullDay
        } else if (timeframe === 'week') {
          payload.week = weekNumber
        }
      }
      
      const response = await fetch('/api/v1/user', {
        method: 'POST',
        body: JSON.stringify(payload)
      })
      
      if (response.ok) {
        await updateUser(session, setGlobalContext, { session, theme })
        setNewEphemeralTask({ name: '', area: 'self', category: 'custom', saveToTemplate: false })
        setShowAddEphemeral(false)
      } else {
        console.error('Failed to add task:', response.status, response.statusText)
      }
    } catch (error) {
      console.error('Error adding task:', error)
    }
  }

  // Function to delete ephemeral task
  const deleteEphemeralTask = async (taskId) => {
    try {
      const payload = {
        [timeframe === 'day' ? 'dayEphemeralTasks' : 'weekEphemeralTasks']: {
          remove: {
            id: taskId
          }
        }
      }
      
      if (timeframe === 'day') {
        payload.date = fullDay
      } else if (timeframe === 'week') {
        payload.week = weekNumber
      }
      
      const response = await fetch('/api/v1/user', {
        method: 'POST',
        body: JSON.stringify(payload)
      })
      
      if (response.ok) {
        await updateUser(session, setGlobalContext, { session, theme })
      } else {
        console.error('Failed to delete ephemeral task:', response.status, response.statusText)
      }
    } catch (error) {
      console.error('Error deleting ephemeral task:', error)
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

  // Create debounced version of handleSubmit for text input
  const debouncedHandleTextSubmit = useDebounce(async (value, field) => {
    await handleMoodSubmit(value, field, fullDay, [], [])
    // Don't call updateUser immediately to avoid clearing mood contacts/things
    // The session will be updated naturally when the user navigates or refreshes
  }, 1000)

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

  // Fetch things
  const { data: thingsData, mutate: mutateThings, isLoading: thingsLoading } = useSWR(
    session?.user ? `/api/v1/things` : null,
    async () => {
      const response = await fetch('/api/v1/things')
      if (response.ok) {
        const data = await response.json()
        setThings(data.things || [])
        return data
      }
      return { things: [] }
    }
  )

  // Ensure contacts are loaded from SWR data
  useEffect(() => {
    if (contactsData?.contacts) {
      setContacts(contactsData.contacts)
    }
  }, [contactsData])

  // Ensure things are loaded from SWR data
  useEffect(() => {
    if (thingsData?.things) {
      setThings(thingsData.things)
    }
  }, [thingsData])

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
              <small>${week?.earnings?.toFixed(2)}</small>
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
    <h2 className="mt-8 mb-4 text-center text-lg">{t('mood.subtitle')}</h2>
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
          {/* Toolbar with add ephemeral task and settings buttons */}
          <div className="flex justify-end gap-2 mb-4">
            <Button
              variant="ghost"
              size="sm"
              className="flex items-center text-muted-foreground hover:text-foreground"
              onClick={() => setShowAddEphemeral(!showAddEphemeral)}
            >
              <Plus className="h-4 w-4 mr-1" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="flex items-center text-muted-foreground hover:text-foreground"
              onClick={() => window.location.href = '/app/settings'}
            >
              <Settings className="h-4 w-4" />
            </Button>
          </div>
          
          {/* Add Ephemeral Task Form */}
          {showAddEphemeral && (
            <Card className="mb-4 p-4">
              <CardHeader>
                <CardTitle className="text-sm">Add Custom Task</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <label className="text-sm font-medium">Task Name</label>
                  <input
                    type="text"
                    value={newEphemeralTask.name}
                    onChange={(e) => setNewEphemeralTask(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Enter task name..."
                    className="w-full p-2 border rounded-md"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Area</label>
                  <select
                    value={newEphemeralTask.area}
                    onChange={(e) => setNewEphemeralTask(prev => ({ ...prev, area: e.target.value }))}
                    className="w-full p-2 border rounded-md"
                  >
                    <option value="self">Self</option>
                    <option value="social">Social</option>
                    <option value="home">Home</option>
                    <option value="work">Work</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium">Category</label>
                  <select
                    value={newEphemeralTask.category}
                    onChange={(e) => setNewEphemeralTask(prev => ({ ...prev, category: e.target.value }))}
                    className="w-full p-2 border rounded-md"
                  >
                    <option value="custom">Custom</option>
                    <option value="body">Body</option>
                    <option value="mind">Mind</option>
                    <option value="spirit">Spirit</option>
                    <option value="social">Social</option>
                    <option value="work">Work</option>
                    <option value="home">Home</option>
                    <option value="fun">Fun</option>
                    <option value="growth">Growth</option>
                    <option value="community">Community</option>
                    <option value="affection">Affection</option>
                    <option value="clean">Clean</option>
                    <option value="maintenance">Maintenance</option>
                    <option value="spirituality">Spirituality</option>
                    <option value="event">Event</option>
                  </select>
                </div>
                <div className="flex items-center space-x-2">
                  <Switch
                    id="save-to-template"
                    checked={newEphemeralTask.saveToTemplate}
                    onCheckedChange={(checked) => setNewEphemeralTask(prev => ({ ...prev, saveToTemplate: checked }))}
                  />
                  <label htmlFor="save-to-template" className="text-sm font-medium">
                    Save to {timeframe === 'day' ? 'daily' : 'weekly'} template
                  </label>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={() => addEphemeralTask(newEphemeralTask)}
                    disabled={!newEphemeralTask.name.trim()}
                    size="sm"
                  >
                    Add Task
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowAddEphemeral(false)
                      setNewEphemeralTask({ name: '', area: 'self', category: 'custom', saveToTemplate: false })
                    }}
                    size="sm"
                  >
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
          
          <ToggleGroup value={values} onValueChange={handleDoneWithDebounce} variant="outline" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 align-center justify-center w-full m-auto" type="multiple" orientation="horizontal">
      {castActions?.map((action) => {
        const taskContactRefs = taskContacts[action.name] || []
        const taskThingRefs = taskThings[action.name] || []
        return (
          <div key={`task__item--${action.name}`} className="flex flex-col items-center m-1">
            <div className="relative w-full">
              <ToggleGroupItem className="rounded-md leading-7 text-sm min-h-[40px] truncate w-full" value={action.name}>
                {action.times > 1 ? `${action.count}/${action.times} ` : ''}{action.displayName || action.name}
              </ToggleGroupItem>
              
              {/* Favorite Button (only for non-ephemeral tasks) */}
              {!action.isEphemeral && (
                <Button
                  variant="ghost"
                  size="sm"
                  className={`absolute top-1/2 right-1 transform -translate-y-1/2 h-6 w-6 p-0 rounded-full ${
                    optimisticFavorites.has(action.name) 
                      ? 'bg-primary' 
                      : 'bg-muted'
                  }`}
                  onClick={(e) => {
                    e.stopPropagation()
                    handleToggleFavorite(action.name)
                  }}
                >
                  <Heart className={`h-3 w-3 ${optimisticFavorites.has(action.name) ? 'fill-muted' : ''}`} />
                </Button>
              )}

              {/* Delete Button for Ephemeral Tasks */}
              {action.isEphemeral && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute top-1/2 right-1 transform -translate-y-1/2 h-6 w-6 p-0 rounded-full bg-muted hover:bg-primary"
                  onClick={(e) => {
                    e.stopPropagation()
                    deleteEphemeralTask(action.id)
                  }}
                >
                  <X className="h-3 w-3 text-destructive" />
                </Button>
              )}

              {/* Contact Management Popover */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="bg-muted absolute top-1/2 left-1 transform -translate-y-1/2 h-6 w-6 p-0 rounded-full"
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
                            // Save the updated contacts to the database using debounced handler
                            debouncedSaveTaskContacts(action.name, newContacts)
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
                                  // Use debounced handler to save to database
                                  debouncedSaveTaskContacts(action.name, updatedContacts)
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

              {/* Things Management Popover */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="bg-muted border-muted absolute top-1/2 left-8 transform -translate-y-1/2 h-6 w-6 p-0 rounded-full"
                  >
                    <Package className="h-3 w-3" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 bg-transparent border-none">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">{t('social.addThingsToTask', { taskName: action.displayName || action.name })}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {!thingsLoading && (
                        <ThingCombobox
                          things={things}
                          selectedThings={taskThingRefs}
                          onThingsChange={(newThings) => {
                            setTaskThings(prev => ({
                              ...prev,
                              [action.name]: newThings
                            }))
                            // Save the updated things to the database using debounced handler
                            debouncedSaveTaskThings(action.name, newThings)
                          }}
                          onThingsRefresh={() => {
                            // Trigger a refresh of the things data
                            mutateThings()
                          }}
                        />
                      )}
                      
                      {/* Interaction Quality Sliders for Selected Things */}
                      {taskThingRefs.length > 0 && (
                        <div className="mt-4 space-y-3">
                          <h4 className="text-sm font-medium text-muted-foreground">Things Interaction Quality Ratings</h4>
                          {taskThingRefs.map((thing) => (
                            <div key={thing.id} className="space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-medium">{thing.name}</span>
                                <span className="text-xs text-muted-foreground">{thing.interactionQuality || 3}/5</span>
                              </div>
                              <Slider
                                value={[thing.interactionQuality || 3]}
                                onValueChange={(value) => {
                                  const updatedThings = taskThingRefs.map(t => 
                                    t.id === thing.id 
                                      ? { ...t, interactionQuality: value[0] }
                                      : t
                                  )
                                  setTaskThings(prev => ({
                                    ...prev,
                                    [action.name]: updatedThings
                                  }))
                                  // Use debounced handler to save to database
                                  debouncedSaveTaskThings(action.name, updatedThings)
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
                    className="text-xs px-1 py-0 h-4 bg-green-100 text-green-800 border-green-200"
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
                        // Save the updated contacts to the database using debounced handler
                        debouncedSaveTaskContacts(action.name, updatedContacts)
                      }}
                    >
                      <X className="h-2 w-2" />
                    </Button>
                  </Badge>
                ))}
              </div>
            )}

            {/* Things Badges */}
            {taskThingRefs.length > 0 && (
              <div className="flex flex-wrap gap-1 justify-center mt-1">
                {taskThingRefs.map((thing) => (
                  <Badge
                    key={thing.id}
                    variant="outline"
                    className="text-xs px-1 py-0 h-4 bg-blue-100 text-blue-800 border-blue-200"
                  >
                    {thing.name}
                    {thing.interactionQuality && (
                      <span className="ml-1 text-xs">
                        {thing.interactionQuality}/5
                      </span>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-3 w-3 p-0 ml-1 hover:bg-transparent"
                      onClick={(e) => {
                        e.stopPropagation()
                        const updatedThings = taskThings[action.name].filter(t => t.id !== thing.id)
                        setTaskThings(prev => ({
                          ...prev,
                          [action.name]: updatedThings
                        }))
                        // Save the updated things to the database using debounced handler
                        debouncedSaveTaskThings(action.name, updatedThings)
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