'use client'
import { useState, useMemo, useEffect, useContext } from "react"
import useSWR from "swr"
import useSWRImmutable from "swr/immutable"
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
import { Users, X, Heart, Settings, Package, Plus, TrendingUp, TrendingDown, ChevronDown, Calendar as CalendarIcon, List as ListIcon, MoreHorizontal, Pencil } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Calendar } from "@/components/ui/calendar"

import { Input } from "@/components/ui/input"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"

import { MoodView } from "@/views/moodView"

import { GlobalContext } from "@/lib/contexts"
import { useI18n } from "@/lib/contexts/i18n"
import { updateUser, generateInsight, handleCloseDates as handleCloseDatesUtil, isUserDataReady, useEnhancedLoadingState, handleMoodSubmit, useUserData } from "@/lib/userUtils"
import { TaskViewSkeleton } from "@/components/ui/skeleton-loader"
import { ContentLoadingWrapper } from '@/components/ContentLoadingWrapper'
import { DAILY_ACTIONS, WEEKLY_ACTIONS, getLocalizedTaskNames } from "@/app/constants"
import { useDebounce } from "@/lib/hooks/useDebounce"

import { useFeatureFlag } from "@/lib/hooks/useFeatureFlag"

export const TaskView = ({ timeframe = "day", actions = [] }) => {
  const { session, setGlobalContext, theme } = useContext(GlobalContext)
  const { t, locale } = useI18n()
  const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  
  // Get user entries for authentication check
  const userEntries = session?.user?.entries;
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
  const [optimisticTaskContacts, setOptimisticTaskContacts] = useState({})
  const [optimisticTaskThings, setOptimisticTaskThings] = useState({})
  const [favorites, setFavorites] = useState(new Set())
  const [optimisticFavorites, setOptimisticFavorites] = useState(new Set())
  const [ephemeralTasks, setEphemeralTasks] = useState([])
  const [showAddEphemeral, setShowAddEphemeral] = useState(false)
  const [newEphemeralTask, setNewEphemeralTask] = useState({ name: '', area: 'self', category: 'custom', saveToTemplate: false })

  // New List form state
  const [showAddList, setShowAddList] = useState(false)
  const [newList, setNewList] = useState({
    name: '',
    templateId: '',
    budget: '',
    dueDate: '',
    cadence: 'one-off',
    role: 'custom',
    collaborators: [] as { id: string, userName: string }[]
  })
  const [newListTasks, setNewListTasks] = useState<any[]>([])
  const [addListTaskOpen, setAddListTaskOpen] = useState(false)
  const [isEditingList, setIsEditingList] = useState(false)
  // New Template form state
  const [showAddTemplate, setShowAddTemplate] = useState(false)
  const [newTemplate, setNewTemplate] = useState({
    name: '',
    createFrom: '', // list:{id}
    visibility: 'PRIVATE',
    tasks: [] as any[]
  })
  const [newTemplateQuickTask, setNewTemplateQuickTask] = useState('')
  const [addTaskOpen, setAddTaskOpen] = useState(false)
  const [addTaskForm, setAddTaskForm] = useState({ name: '', area: 'self', category: 'custom', times: 1 })
  const [dueDateObj, setDueDateObj] = useState<Date | undefined>(undefined)
  const [dateOpen, setDateOpen] = useState(false)
  const [collabQuery, setCollabQuery] = useState('')
  const { data: collabResults } = useSWRImmutable(collabQuery ? `/api/v1/profiles?query=${encodeURIComponent(collabQuery)}` : null, async (key) => {
    const res = await fetch(key)
    if (!res.ok) return { profiles: [] }
    return res.json()
  })

  // Fetch user templates for the template selector
  const { data: templatesResp } = useSWRImmutable(session ? '/api/v1/templates' : null, async (key) => {
    const res = await fetch(key)
    if (!res.ok) return { templates: [] }
    return res.json()
  })
  const userTemplates = templatesResp?.templates || []

  // Preview tasks for selected template/list clone option (declared after allTaskLists is initialized)
  // NOTE: this will be redefined later after allTaskLists is declared to avoid TDZ

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
  const agentConversation = session?.user?.entries && session?.user?.entries[year] && session?.user?.entries[year].weeks && session?.user?.entries[year]?.weeks[weekNumber] && session?.user?.entries[year]?.weeks[weekNumber].agentConversation
  const reverseMessages = useMemo (() => agentConversation?.length ? agentConversation.sort((a,b) => new Date(a.timestamp).getTime() > new Date(b.timestamp).getTime() ? 1 : -1) : [], [JSON.stringify(session?.user)])
  
  const earnings = Object.keys(session?.user?.entries || 0).length > 0 ? timeframe === "day" ? session?.user?.entries[year]?.days[date]?.earnings?.toFixed(2) : session?.user?.entries[year]?.weeks[weekNumber]?.earnings?.toFixed(2) : 0
  const rawTicker = Object.keys(session?.user?.entries || 0).length > 0 ? timeframe === "day" ? session?.user?.entries[year]?.days[date]?.ticker : session?.user?.entries[year]?.weeks[weekNumber]?.ticker : 0
  const ticker = typeof rawTicker === 'object' ? (timeframe === 'day' ? rawTicker?.['1d'] : rawTicker?.['1w']) : rawTicker

  // removed debug log


  // State for TaskLists
  const [dailyTaskList, setDailyTaskList] = useState<any>(null)
  const [weeklyTaskList, setWeeklyTaskList] = useState<any>(null)
  const [allTaskLists, setAllTaskLists] = useState<any[]>([])
  const [selectedTaskListId, setSelectedTaskListId] = useState<string>('')
  const [taskListsLoading, setTaskListsLoading] = useState(true)

  const userKey = session?.user?.userId || session?.user?.id
  const { data: taskListsData, isLoading: swrTaskListsLoading } = useSWRImmutable(
    userKey ? `/api/v1/tasklists` : null,
    async () => {
      const response = await fetch('/api/v1/tasklists')
      if (response.ok) {
        return await response.json()
      }
      return { taskLists: [] }
    },
    { revalidateOnFocus: false, revalidateOnReconnect: false, revalidateIfStale: false, dedupingInterval: 30000 }
  )

  useEffect(() => {
    setTaskListsLoading(swrTaskListsLoading)
  }, [swrTaskListsLoading])

  useEffect(() => {
    if (!taskListsData) return
    const taskLists = taskListsData.taskLists || []
    setAllTaskLists(taskLists)
    
    const dailyTaskList = taskLists.find((tl: any) => tl.role === 'daily.default')
    const weeklyTaskList = taskLists.find((tl: any) => tl.role === 'weekly.default')
    setDailyTaskList(dailyTaskList || null)
    setWeeklyTaskList(weeklyTaskList || null)
    
    if (!selectedTaskListId) {
      const defaultTaskList = timeframe === 'day' ? dailyTaskList : weeklyTaskList
      if (defaultTaskList) {
        setSelectedTaskListId(defaultTaskList.id)
      } else if (taskLists.length > 0) {
        setSelectedTaskListId(taskLists[0].id)
      }
    } else {
      // Ensure currently selected list still exists; if not, pick a sensible default without triggering extra fetches
      const exists = taskLists.some((tl: any) => tl.id === selectedTaskListId)
      if (!exists) {
        const fallback = (timeframe === 'day' ? dailyTaskList : weeklyTaskList) || taskLists[0]
        if (fallback?.id) setSelectedTaskListId(fallback.id)
      }
    }
    
  }, [taskListsData, timeframe])

  // Compute preview tasks for new template (after allTaskLists is initialized)
  const newTemplatePreviewTasks = useMemo(() => {
    if (newTemplate.createFrom?.startsWith('list:')) {
      const lstId = newTemplate.createFrom.split(':')[1]
      const lst = allTaskLists.find((l: any) => l.id === lstId)
      return Array.isArray(lst?.tasks) ? lst.tasks : []
    }
    return [] as any[]
  }, [newTemplate.createFrom, allTaskLists])

  // Aggregated tasks for template: user-added (prepended) + selected list tasks
  const newTemplateAggregatedTasks = useMemo(() => {
    return [...newTemplate.tasks, ...newTemplatePreviewTasks]
  }, [newTemplate.tasks, newTemplatePreviewTasks])

  // Preview tasks for selected template/list clone option
  const newListPreviewTasks = useMemo(() => {
    if (!newList.templateId) return [] as any[]
    if (newList.templateId.startsWith('template:')) {
      const tplId = newList.templateId.split(':')[1]
      const tpl = userTemplates.find((t: any) => t.id === tplId)
      return Array.isArray(tpl?.tasks) ? tpl.tasks : []
    }
    if (newList.templateId.startsWith('list:')) {
      const lstId = newList.templateId.split(':')[1]
      const lst = allTaskLists.find((l: any) => l.id === lstId)
      return Array.isArray(lst?.tasks) ? lst.tasks : []
    }
    return [] as any[]
  }, [newList.templateId, userTemplates, allTaskLists])

  // Sync selected template/list tasks into a temporary editable state for the New List form
  useEffect(() => {
    setNewListTasks(newListPreviewTasks)
  }, [newListPreviewTasks])

  // Lists to display in selector: show all user task lists (no timeframe filtering)
  const displayedTaskLists = useMemo(() => {
    if (!Array.isArray(allTaskLists)) return []
    return allTaskLists
  }, [allTaskLists])

  // Selected TaskList object and key for storage
  const selectedList = useMemo(() => allTaskLists.find(tl => tl.id === selectedTaskListId), [allTaskLists, selectedTaskListId])
  const selectedTaskListKey = useMemo(() => {
    if (!selectedList) return undefined
    const base = selectedList.name || selectedList.role || 'tasklist'
    return `${base}__${selectedList.id}`
  }, [selectedList])

  // Handle select changes, including synthetic create options
  const handleSelectTaskList = async (value: string) => {
    try {
      if (value === 'create-daily-default') {
        const resp = await fetch('/api/v1/tasklists', { method: 'POST', body: JSON.stringify({ role: 'daily.default', tasks: DAILY_ACTIONS }) })
        if (resp.ok) {
          const refetch = await fetch('/api/v1/tasklists')
          if (refetch.ok) {
            const data = await refetch.json()
            const lists = data.taskLists || []
            setAllTaskLists(lists)
            const created = lists.find((tl: any) => tl.role === 'daily.default')
            if (created) {
              setDailyTaskList(created)
              setSelectedTaskListId(created.id)
            }
          }
        }
        return
      }
      if (value === 'create-weekly-default') {
        const resp = await fetch('/api/v1/tasklists', { method: 'POST', body: JSON.stringify({ role: 'weekly.default', tasks: WEEKLY_ACTIONS }) })
        if (resp.ok) {
          const refetch = await fetch('/api/v1/tasklists')
          if (refetch.ok) {
            const data = await refetch.json()
            const lists = data.taskLists || []
            setAllTaskLists(lists)
            const created = lists.find((tl: any) => tl.role === 'weekly.default')
            if (created) {
              setWeeklyTaskList(created)
              setSelectedTaskListId(created.id)
            }
          }
        }
        return
      }
      setSelectedTaskListId(value)
      // If editing, repopulate form with the newly selected list
      if (showAddList) {
        const lst = (taskListsData?.taskLists || []).find((tl: any) => tl.id === value)
        if (lst) {
          let cadence = 'one-off'
          let role = 'custom'
          if (typeof lst.role === 'string' && lst.role.includes('.')) {
            const [c, r] = lst.role.split('.')
            cadence = c || cadence
            role = r || role
          } else if (lst.role === 'custom') {
            role = 'custom'
          }
          setIsEditingList(true)
          setNewList({
            name: lst.name || '',
            templateId: lst.templateId ? `template:${lst.templateId}` : '',
            budget: lst.budget || '',
            dueDate: lst.dueDate || '',
            cadence,
            role,
            collaborators: (lst.collaborators || []).map((id: string) => ({ id, userName: id }))
          })
          setNewListTasks(Array.isArray(lst.tasks) ? lst.tasks : [])
        }
      }
    } catch (e) {
      console.error('Error selecting task list:', e)
    }
  }

  // Open New List form (exclusive)
  const handleOpenNewTaskListForm = () => {
    setShowAddEphemeral(false)
    setShowAddTemplate(false)
    setShowAddList(true)
  }

  // Submit New List
  const handleCreateListSubmit = async () => {
    try {
      let tasks: any[] = newListTasks || []
      let templateIdToLink: string | undefined = undefined
      if (newList.templateId?.startsWith('template:')) {
        const tplId = newList.templateId.split(':')[1]
        templateIdToLink = tplId
      } else if (newList.templateId?.startsWith('list:')) {
        // cloning from a list does not set templateId
        templateIdToLink = undefined
      }
      const roleJoined = `${newList.cadence}.${newList.role}`

      const resp = await fetch('/api/v1/tasklists', {
        method: 'POST',
        body: JSON.stringify({
          create: !isEditingList,
          role: roleJoined,
          name: newList.name || undefined,
          budget: newList.budget || undefined,
          dueDate: newList.dueDate || undefined,
          templateId: templateIdToLink,
          collaborators: newList.collaborators.map(c => c.id),
          tasks
        })
      })
      if (!resp.ok) return

      const refetch = await fetch('/api/v1/tasklists')
      if (!refetch.ok) return
      const data = await refetch.json()
      const lists = data.taskLists || []
      setAllTaskLists(lists)
      // pick by exact concatenated role first, else by name
      const created = lists.find((tl: any) => tl.role === roleJoined) || lists.find((tl: any) => newList.name && tl.name === newList.name)
      if (created?.id) setSelectedTaskListId(created.id)
      setShowAddList(false)
      setIsEditingList(false)
      setNewList({ name: '', templateId: '', budget: '', dueDate: '', cadence: 'one-off', role: 'custom', collaborators: [] })
    } catch (e) {
      console.error('Error creating list:', e)
    }
  }

  const userTasks = useMemo(() => {
    let regularTasks = []
    
    // Get the selected TaskList
    const selectedTaskList = allTaskLists.find(tl => tl.id === selectedTaskListId)
    
    if (timeframe === 'day') {
      const noDayData = !session?.user?.entries || !session?.user?.entries[year] || !Object.keys(session?.user?.entries[year].days).length
      const listKey = selectedTaskListKey
      const listScopedDayTasks = listKey ? (session?.user?.entries?.[year]?.[listKey]?.[date]?.tasks) : undefined
      const dailyTasks = (listScopedDayTasks && Array.isArray(listScopedDayTasks) ? listScopedDayTasks : (((session?.user?.entries && session?.user?.entries[year] && session?.user?.entries[year].days && session?.user?.entries[year].days[date]) && session?.user?.entries[year].days[date]?.tasks) || (noDayData ? DAILY_ACTIONS : [])))
      
      // Use selected TaskList if available, otherwise fall back to dailyTaskList or dailyTasks
      if (selectedTaskList?.tasks && selectedTaskList.tasks.length > 0) {
        // Start with TaskList tasks as base, then merge with day tasks for completion status
        const taskListTasks = getLocalizedTaskNames(selectedTaskList.tasks, t)
        const dayTasksLocalized = getLocalizedTaskNames(dailyTasks, t)
        
        // Create maps for proper merging
        const taskListMap = {}
        taskListTasks.forEach(task => {
          taskListMap[task.name] = task
        })
        
        const dayTasksMap = {}
        dayTasksLocalized.forEach(task => {
          dayTasksMap[task.name] = task
        })
        
        // Merge using assign (day tasks override task list tasks for completion status)
        const mergedTasks = assign({}, taskListMap, dayTasksMap)
        // Only include tasks that are in the selected TaskList
        regularTasks = Object.values(mergedTasks).filter(task => taskListMap[task.name])
      } else if (dailyTaskList?.tasks && dailyTaskList.tasks.length > 0) {
        const taskListTasks = getLocalizedTaskNames(dailyTaskList.tasks, t)
        const dayTasksLocalized = getLocalizedTaskNames(dailyTasks, t)
        
        const taskListMap = {}
        taskListTasks.forEach(task => {
          taskListMap[task.name] = task
        })
        
        const dayTasksMap = {}
        dayTasksLocalized.forEach(task => {
          dayTasksMap[task.name] = task
        })
        
        const mergedTasks = assign({}, taskListMap, dayTasksMap)
        // Only include tasks that are in the default TaskList
        regularTasks = Object.values(mergedTasks).filter(task => taskListMap[task.name])
      } else {
        regularTasks = getLocalizedTaskNames(dailyTasks, t)
      }
    } else if (timeframe === 'week') {
      const noWeekData = !session?.user?.entries || !session?.user?.entries[year] || !Object.keys(session?.user?.entries[year].weeks).length
      const listKey = selectedTaskListKey
      const listScopedWeekTasks = listKey ? (session?.user?.entries?.[year]?.[listKey]?.[weekNumber]?.tasks) : undefined
      const weeklyTasks = (listScopedWeekTasks && Array.isArray(listScopedWeekTasks) ? listScopedWeekTasks : ((session?.user?.entries && session?.user?.entries[year] && session?.user?.entries[year].weeks) && session?.user?.entries[year].weeks[weekNumber]?.tasks || []))
      
      // Use selected TaskList if available, otherwise fall back to weeklyTaskList or weeklyTasks
      if (selectedTaskList?.tasks && selectedTaskList.tasks.length > 0) {
        // Start with TaskList tasks as base, then merge with week tasks for completion status
        const taskListTasks = getLocalizedTaskNames(selectedTaskList.tasks, t)
        const weekTasksLocalized = getLocalizedTaskNames(weeklyTasks, t)
        
        // Create maps for proper merging
        const taskListMap = {}
        taskListTasks.forEach(task => {
          taskListMap[task.name] = task
        })
        
        const weekTasksMap = {}
        weekTasksLocalized.forEach(task => {
          weekTasksMap[task.name] = task
        })
        
        // Merge using assign (week tasks override task list tasks for completion status)
        const mergedTasks = assign({}, taskListMap, weekTasksMap)
        // Only include tasks that are in the selected TaskList
        regularTasks = Object.values(mergedTasks).filter(task => taskListMap[task.name])
      } else if (weeklyTaskList?.tasks && weeklyTaskList.tasks.length > 0) {
        const taskListTasks = getLocalizedTaskNames(weeklyTaskList.tasks, t)
        const weekTasksLocalized = getLocalizedTaskNames(weeklyTasks, t)
        
        const taskListMap = {}
        taskListTasks.forEach(task => {
          taskListMap[task.name] = task
        })
        
        const weekTasksMap = {}
        weekTasksLocalized.forEach(task => {
          weekTasksMap[task.name] = task
        })
        
        const mergedTasks = assign({}, taskListMap, weekTasksMap)
        // Only include tasks that are in the default TaskList
        regularTasks = Object.values(mergedTasks).filter(task => taskListMap[task.name])
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

    // Dedupe: if an ephemeral task also exists in the selected TaskList by name, hide the entry-level copy
    const listTaskNames = new Set((selectedTaskList?.tasks || []).map((t:any) => t.name))
    const dedupedEphemeral = ephemeralTasksWithDisplayName.filter(t => !listTaskNames.has(t.name))
    
    return [...regularTasks, ...dedupedEphemeral]
  }, [selectedTaskListId, allTaskLists, dailyTaskList, weeklyTaskList, date, weekNumber, t, currentEphemeralTasks])


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

  // Load existing task contacts and things from database
  useEffect(() => {
    if (timeframe === 'day') {
      const dayEntry = session?.user?.entries?.[year]?.days?.[date]
      if (dayEntry) {
        setTaskContacts(dayEntry.taskContacts || {})
        setTaskThings(dayEntry.taskThings || {})
        setOptimisticTaskContacts(dayEntry.taskContacts || {})
        setOptimisticTaskThings(dayEntry.taskThings || {})
      }
    } else if (timeframe === 'week') {
      const weekEntry = session?.user?.entries?.[year]?.weeks?.[weekNumber]
      if (weekEntry) {
        setTaskContacts(weekEntry.taskContacts || {})
        setTaskThings(weekEntry.taskThings || {})
        setOptimisticTaskContacts(weekEntry.taskContacts || {})
        setOptimisticTaskThings(weekEntry.taskThings || {})
      }
    }
  }, [session?.user?.entries, year, date, weekNumber, timeframe])

  // Load favorites from selected TaskList
  useEffect(() => {
    const selectedTaskList = allTaskLists.find(tl => tl.id === selectedTaskListId)
    
    if (selectedTaskList?.tasks && Array.isArray(selectedTaskList.tasks)) {
      const favoriteSet = new Set()
      selectedTaskList.tasks.forEach(item => {
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
  }, [selectedTaskListId, allTaskLists])

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
    const day = session?.user?.entries && session?.user?.entries[year] && session?.user?.entries[year].days && session?.user?.entries[year].days[date]
    if (!day) {
      return true
    }
    const mood = day.mood
    if (!mood || typeof mood !== 'object') {
      return true
    }
    const moodValues = Object.values(mood).filter((val) => val !== null && val !== undefined && !isNaN(val as any))
    if (moodValues.length === 0) {
      return true
    }
    return moodValues.every((value: any) => Number(value) === 0)
  }, [fullDay, year, date, session?.user?.userId])


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
          week: weekNumber,
          taskListKey: selectedTaskListKey
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
    
    // Don't call updateUser to avoid resetting moodView selections
    // The session will be updated naturally when the user navigates or refreshes
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
          week: weekNumber,
          taskListKey: selectedTaskListKey
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

    await refreshUser()

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
      const selectedTaskList = allTaskLists.find(tl => tl.id === selectedTaskListId)
      
      if (!selectedTaskList?.tasks) {
        console.error('No task list found for favorites update')
        setOptimisticFavorites(favorites)
        return
      }
      
      // Update task list items with favorite flags based on the passed state
      const updatedTasks = selectedTaskList.tasks.map(item => {
        const itemName = typeof item === 'string' ? item : item.name
        return {
          ...(typeof item === 'object' ? item : { name: item }),
          favorite: currentOptimisticFavorites.has(itemName)
        }
      })
      
      const payload = {
        role: selectedTaskList.role,
        tasks: updatedTasks,
        templateId: selectedTaskList.templateId
      }
      
      const response = await fetch('/api/v1/tasklists', {
        method: 'POST',
        body: JSON.stringify(payload)
      })
      
      if (response.ok) {
        const data = await response.json()
        // Update the local task list state
        setAllTaskLists(prev => prev.map(tl => tl.id === selectedTaskListId ? data.taskList : tl))
        // Update the actual favorites state on success
        setFavorites(currentOptimisticFavorites)
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
      if (!response.ok) {
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
      if (!response.ok) {
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
      // Generate a stable id for the new ephemeral task
      const newEphemeralId = `ephemeral_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`

      const listTask = {
        id: newEphemeralId,
        name: taskData.name,
        area: taskData.area,
        categories: [taskData.category],
        cadence: timeframe,
        status: "Not started",
        times: 1,
        count: 0,
        isEphemeral: !taskData.saveToTemplate,
        createdAt: new Date().toISOString()
      }

      // Always add to the selected TaskList
      const selectedTaskList = allTaskLists.find(tl => tl.id === selectedTaskListId)
      const currentTasks = selectedTaskList?.tasks || []

      const listPayload: any = {
        role: selectedTaskList?.role || (timeframe === 'day' ? 'daily.default' : 'weekly.default'),
        tasks: [...currentTasks, listTask],
        templateId: selectedTaskList?.templateId,
        updateTemplate: !!taskData.saveToTemplate
      }

      const listResponse = await fetch('/api/v1/tasklists', {
        method: 'POST',
        body: JSON.stringify(listPayload)
      })

      if (!listResponse.ok) {
        console.error('Failed to save task to task list:', listResponse.status, listResponse.statusText)
        return
      }

      const listData = await listResponse.json()
      setAllTaskLists(prev => prev.map(tl => tl.id === selectedTaskListId ? listData.taskList : tl))

      // Also add to the user's current entry as an ephemeral instance (so progress is tracked for this period)
      const entryPayload: any = {
        [timeframe === 'day' ? 'dayEphemeralTasks' : 'weekEphemeralTasks']: {
          add: {
            id: newEphemeralId,
            name: taskData.name,
            area: taskData.area,
            categories: [taskData.category],
            status: "Not started",
            times: 1,
            count: 0,
            isEphemeral: true
          }
        }
      }

      if (timeframe === 'day') {
        entryPayload.date = fullDay
      } else if (timeframe === 'week') {
        entryPayload.week = weekNumber
      }

      const entryResponse = await fetch('/api/v1/user', {
        method: 'POST',
        body: JSON.stringify(entryPayload)
      })

      if (!entryResponse.ok) {
        console.error('Failed to add ephemeral task to entry:', entryResponse.status, entryResponse.statusText)
      } else {
        await refreshUser()
      }

      setNewEphemeralTask({ name: '', area: 'self', category: 'custom', saveToTemplate: false })
      setShowAddEphemeral(false)
    } catch (error) {
      console.error('Error adding task:', error)
    }
  }

  // Function to delete ephemeral task
  const deleteEphemeralTask = async (taskId) => {
    try {
      // First, try to remove from the selected TaskList (if present)
      const selectedTaskList = allTaskLists.find(tl => tl.id === selectedTaskListId)
      const currentTasks = selectedTaskList?.tasks || []
      const existsInList = currentTasks.some((t:any) => t.id === taskId)

      if (existsInList) {
        const updatedTasks = currentTasks.filter((t:any) => t.id !== taskId)
        const listPayload = {
          role: selectedTaskList?.role || (timeframe === 'day' ? 'daily.default' : 'weekly.default'),
          tasks: updatedTasks,
          templateId: selectedTaskList?.templateId
        }
        const listResp = await fetch('/api/v1/tasklists', {
          method: 'POST',
          body: JSON.stringify(listPayload)
        })
        if (listResp.ok) {
          const data = await listResp.json()
          setAllTaskLists(prev => prev.map(tl => tl.id === selectedTaskListId ? data.taskList : tl))
        } else {
          console.error('Failed to delete from task list:', listResp.status, listResp.statusText)
        }
      }

      // Then remove from the current user entry, if exists
      const payload:any = {
        [timeframe === 'day' ? 'dayEphemeralTasks' : 'weekEphemeralTasks']: {
          remove: { id: taskId }
        }
      }
      if (timeframe === 'day') payload.date = fullDay
      else if (timeframe === 'week') payload.week = weekNumber

      const response = await fetch('/api/v1/user', {
        method: 'POST',
        body: JSON.stringify(payload)
      })
      
      if (response.ok) {
        await refreshUser()
      } else {
        console.error('Failed to delete ephemeral task:', response.status, response.statusText)
      }
    } catch (error) {
      console.error('Error deleting ephemeral task:', error)
    }
  }

  const handleCloseDates = async (values) => {
    await handleCloseDatesUtil(values, timeframe)
    await refreshUser()
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

  const { isLoading, refreshUser } = useUserData(session, setGlobalContext)

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

  // removed debug log

  // No on-mount refresh to avoid duplicate GETs; rely on SWR cache

  // Use enhanced loading state to prevent flashing
  const isDataLoading = useEnhancedLoadingState(isLoading, session, 100, timeframe)

  if (isDataLoading || taskListsLoading) {
    return <TaskViewSkeleton />
  }

  // Check if user is properly authenticated and session is valid
  // if (!session?.user || !session?.user?.userId || Object.keys(session.user).length === 0) {
  //   return <TaskViewSkeleton />
  // }

  // Additional check to ensure user data is accessible (prevents showing data for expired sessions)
  // if (!userEntries || typeof userEntries !== 'object') {
  //   return <TaskViewSkeleton />
  // }

  return <div className="max-w-[1200px] m-auto p-4">
    <p className="sticky top-23 truncate z-[999] text-center scroll-m-20 text-sm font-semibold tracking-tight mb-8 flex items-center justify-center gap-2">
      <span>{t('tasks.editing', { timeframe: timeframe === "day" ? date : t('tasks.weekNumber', { number: weekNumber }) })}</span>
      {ticker !== undefined && ticker !== 0 && (
        <span className={`inline-flex items-center gap-1 ${ticker > 0 ? 'text-success' : 'text-destructive'}`}>
          {ticker > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          {Math.abs(ticker?.toFixed(1))}%
        </span>
      )}
    </p>
    {(timeframe === "day" && openDays?.length) || (timeframe === "week" && openWeeks?.length) ? <Carousel className="max-w-[196px] md:max-w-[380px] m-auto">
      <CarouselContent className="text-center w-[192px] my-8">
        {
          timeframe === "day" ? openDays?.map((day, index) => {
            const tickerValue = typeof day.ticker === 'object' ? (day.ticker?.['1d'] ?? 0) : (day.ticker || 0)
            return <CarouselItem key={`task__carousel--${day.date}--${index}`} className="flex flex-col">
              <small>Ð{day.earnings?.toFixed(2)}</small>
              <small className={`font-semibold flex items-center justify-center gap-1 ${tickerValue > 0 ? 'text-success' : tickerValue < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                {tickerValue > 0 ? <TrendingUp className="h-3 w-3" /> : tickerValue < 0 ? <TrendingDown className="h-3 w-3" /> : null}
                {typeof tickerValue === 'number' ? Math.abs(tickerValue).toFixed(1) : '0.0'}%
              </small>
              <label className="mb-4">{day.date}</label>
              <Button className="dark:bg-foreground text-md p-5 mb-2" onClick={() => handleEditDay(new Date(day.date))}>{t('common.edit')} {t('common.day').toLowerCase()}</Button>
              <Button variant="outline" className="text-md p-5" onClick={() => handleCloseDates([day.date])} >{t('common.close')} {t('common.day').toLowerCase()}</Button>
            </CarouselItem>
          }) : openWeeks?.map((week, index) => {
            const tickerValue = typeof week.ticker === 'object' ? (week.ticker?.['1w'] ?? 0) : (week.ticker || 0)
            return <CarouselItem key={`task__carousel--${week.week}--${index}`} className="flex flex-col">
              <small>Ð{week?.earnings?.toFixed(2)}</small>
              <small className={`font-semibold flex items-center justify-center gap-1 ${tickerValue > 0 ? 'text-success' : tickerValue < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                {tickerValue > 0 ? <TrendingUp className="h-3 w-3" /> : tickerValue < 0 ? <TrendingDown className="h-3 w-3" /> : null}
                {typeof tickerValue === 'number' ? Math.abs(tickerValue).toFixed(1) : '0.0'}%
              </small>
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
          {/* Toolbar with TaskList selector, add ephemeral task and settings buttons */}
          <div className="flex justify-between items-center gap-2 mb-4">
            {/* TaskList Selector */}
            <div className="flex items-center gap-2">
              <Select value={selectedTaskListId} onValueChange={handleSelectTaskList}>
                <SelectTrigger className="w-[200px] h-8">
                  <SelectValue placeholder="Select task list" />
                </SelectTrigger>
                <SelectContent>
                  {displayedTaskLists.length > 0 ? displayedTaskLists.map((taskList) => {
                    const roleLabel = taskList.role === 'daily.default' ? 'Daily Default' :
                           taskList.role === 'weekly.default' ? 'Weekly Default' :
                           taskList.role || 'Custom'
                    const displayName = taskList.name || roleLabel
                    return (
                    <SelectItem key={taskList.id} value={taskList.id} textValue={displayName}>
                      <div className="flex flex-col">
                        <span className="font-medium">
                          {displayName}
                        </span>
                      </div>
                    </SelectItem>)
                  }) : (
                    <>
                      <SelectItem value="create-daily-default" textValue="Create Daily Default">
                        <div className="flex flex-col">
                          <span className="font-medium">Create Daily Default</span>
                          <span className="text-xs text-muted-foreground">Use built-in daily tasks</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="create-weekly-default" textValue="Create Weekly Default">
                        <div className="flex flex-col">
                          <span className="font-medium">Create Weekly Default</span>
                          <span className="text-xs text-muted-foreground">Use built-in weekly tasks</span>
                        </div>
                      </SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>
            
            {/* Action buttons */}
            <div className="flex gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="flex items-center text-muted-foreground hover:text-foreground"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => {
                    setShowAddList(false)
                    setShowAddTemplate(false)
                    setShowAddEphemeral(true)
                  }}>
                    New task
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleOpenNewTaskListForm}>
                    New list
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => {
                    setShowAddEphemeral(false)
                    setShowAddList(false)
                    setShowAddTemplate(true)
                  }}>
                    New template
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                variant="ghost"
                size="sm"
                className="flex items-center text-muted-foreground hover:text-foreground"
                onClick={async () => {
                  const lst: any = selectedList
                  if (!lst) return
                  // Exclusively open list form
                  setShowAddEphemeral(false)
                  setShowAddTemplate(false)
                  setIsEditingList(true)
                  // Pre-populate form
                  let cadence = 'one-off'
                  let role = 'custom'
                  if (typeof lst.role === 'string' && lst.role.includes('.')) {
                    const [c, r] = lst.role.split('.')
                    cadence = c || cadence
                    role = r || role
                  } else if (lst.role === 'custom') {
                    role = 'custom'
                  }
                  setNewList({
                    name: lst.name || '',
                    templateId: lst.templateId ? `template:${lst.templateId}` : '',
                    budget: lst.budget || '',
                    dueDate: lst.dueDate || '',
                    cadence,
                    role,
                    collaborators: (lst.collaborators || []).map((id: string) => ({ id, userName: id }))
                  })
                  setNewListTasks(Array.isArray(lst.tasks) ? lst.tasks : [])
                  setShowAddList(true)

                  // Resolve collaborator usernames
                  const ids = (lst.collaborators || [])
                  if (Array.isArray(ids) && ids.length) {
                    try {
                      const res = await fetch(`/api/v1/profiles/by-ids?ids=${encodeURIComponent(ids.join(','))}`)
                      if (res.ok) {
                        const data = await res.json()
                        const map: Record<string, string> = {}
                        ;(data.profiles || []).forEach((p: any) => {
                          map[p.userId] = p.userName
                        })
                        setNewList(prev => ({
                          ...prev,
                          collaborators: ids.map((id: string) => ({ id, userName: map[id] || id }))
                        }))
                      }
                    } catch (e) {
                      // ignore
                    }
                  }
                }}
              >
                <Pencil className="h-4 w-4" />
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
          </div>
          
          {/* Selected List meta badges */}
          {(selectedList?.budget || selectedList?.dueDate) && (
            <div className="mb-4 flex items-center gap-2">
              {selectedList?.budget && (
                <Badge variant="secondary">Budget: {selectedList.budget}</Badge>
              )}
              {selectedList?.dueDate && (
                <Badge variant="secondary">Due: {selectedList.dueDate}</Badge>
              )}
            </div>
          )}

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
                    Save task to template
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

          {/* Add New List Form */}
          {showAddList && (
            <Card className="mb-4 p-4">
              <CardHeader>
                <CardTitle className="text-sm">{isEditingList ? 'Edit List' : 'Create New List'}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <label className="text-sm font-medium">Name</label>
                  <input
                    type="text"
                    value={newList.name}
                    onChange={(e) => setNewList(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Enter list name..."
                    className="w-full p-2 border rounded-md"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Template or List</label>
                  <Select value={newList.templateId} onValueChange={(val) => setNewList(prev => ({ ...prev, templateId: val }))}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Choose a template" />
                    </SelectTrigger>
                    <SelectContent>
                      {userTemplates.map((tpl: any) => (
                        <SelectItem key={`tpl-${tpl.id}`} value={`template:${tpl.id}`} textValue={tpl.name || tpl.role || 'Template'}>
                          <div className="flex items-center gap-2">
                            <Package className="h-4 w-4 opacity-70" />
                            <span>{tpl.name || tpl.role || 'Template'}</span>
                          </div>
                        </SelectItem>
                      ))}
                      {allTaskLists.map((lst: any) => (
                        <SelectItem key={`lst-${lst.id}`} value={`list:${lst.id}`} textValue={lst.name || lst.role || 'List'}>
                          <div className="flex items-center gap-2">
                            <ListIcon className="h-4 w-4 opacity-70" />
                            <span>{lst.name || lst.role || 'List'}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="text-sm font-medium">Budget</label>
                    <input
                      type="number"
                      value={newList.budget}
                      onChange={(e) => setNewList(prev => ({ ...prev, budget: e.target.value }))}
                      placeholder="0"
                      className="w-full p-2 border rounded-md"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Due date</label>
                    <Popover open={dateOpen} onOpenChange={setDateOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full justify-start text-left font-normal">
                          {dueDateObj ? dueDateObj.toISOString().slice(0,10) : <span>Pick a date</span>}
                          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="p-0">
                        <Calendar
                          mode="single"
                          selected={dueDateObj}
                          onSelect={(date) => {
                            setDueDateObj(date)
                            setNewList(prev => ({ ...prev, dueDate: date ? date.toISOString().slice(0,10) : '' }))
                            setDateOpen(false)
                          }}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Cadence</label>
                    <Select value={newList.cadence} onValueChange={(val) => setNewList(prev => ({ ...prev, cadence: val }))}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="one-off">One-off</SelectItem>
                        <SelectItem value="daily">Daily</SelectItem>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                        <SelectItem value="quarterly">Quarterly</SelectItem>
                        <SelectItem value="semester">Semester</SelectItem>
                        <SelectItem value="yearly">Yearly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium">Collaborators</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-between">
                        <span>{newList.collaborators.length > 0 ? `${newList.collaborators.length} selected` : 'Search usernames...'}</span>
                        <ChevronDown className="h-4 w-4 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[320px] p-0">
                      <Command shouldFilter={false}>
                        <CommandInput placeholder="Type a username..." value={collabQuery} onValueChange={setCollabQuery} />
                        <CommandList>
                          <CommandEmpty>No results.</CommandEmpty>
                          <CommandGroup>
                            {(collabResults?.profiles || []).map((p: any) => (
                              <CommandItem key={p.userId} value={p.userId} onSelect={() => {
                                if (!newList.collaborators.find(c => c.id === p.userId)) {
                                  setNewList(prev => ({ ...prev, collaborators: [...prev.collaborators, { id: p.userId, userName: p.userName }] }))
                                }
                              }}>
                                @{p.userName}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  {newList.collaborators.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {newList.collaborators.map((c) => (
                        <Badge key={c.id} variant="secondary" className="flex items-center gap-1">
                          @{c.userName}
                          <Button variant="ghost" size="sm" className="h-4 w-4 p-0 hover:bg-transparent" onClick={() => setNewList(prev => ({ ...prev, collaborators: prev.collaborators.filter(x => x.id !== c.id) }))}>
                            <X className="h-3 w-3" />
                          </Button>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <label className="text-sm font-medium">Role</label>
                  <Select value={newList.role} onValueChange={(val) => setNewList(prev => ({ ...prev, role: val }))}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="custom">Custom</SelectItem>
                      <SelectItem value="default">Default</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* List tasks preview/editor in Accordion */}
                <div>
                  <Accordion type="single" collapsible>
                    <AccordionItem value="new-list-tasks">
                      <AccordionTrigger>Tasks</AccordionTrigger>
                      <AccordionContent>
                        <div className="flex justify-end mb-2">
                          <Popover open={addListTaskOpen} onOpenChange={setAddListTaskOpen}>
                            <PopoverTrigger asChild>
                              <Button variant="default">Add task</Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[320px]">
                              <div className="space-y-2">
                                <div>
                                  <label className="text-sm font-medium">Name</label>
                                  <input className="w-full p-2 border rounded-md" value={addTaskForm.name} onChange={(e) => setAddTaskForm(prev => ({ ...prev, name: e.target.value }))} />
                                </div>
                                <div>
                                  <label className="text-sm font-medium">Area</label>
                                  <Select value={addTaskForm.area} onValueChange={(val) => setAddTaskForm(prev => ({ ...prev, area: val }))}>
                                    <SelectTrigger className="w-full">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="self">Self</SelectItem>
                                      <SelectItem value="home">Home</SelectItem>
                                      <SelectItem value="social">Social</SelectItem>
                                      <SelectItem value="work">Work</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div>
                                  <label className="text-sm font-medium">Category</label>
                                  <Select value={addTaskForm.category} onValueChange={(val) => setAddTaskForm(prev => ({ ...prev, category: val }))}>
                                    <SelectTrigger className="w-full">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="custom">Custom</SelectItem>
                                      <SelectItem value="body">Body</SelectItem>
                                      <SelectItem value="mind">Mind</SelectItem>
                                      <SelectItem value="spirit">Spirit</SelectItem>
                                      <SelectItem value="fun">Fun</SelectItem>
                                      <SelectItem value="growth">Growth</SelectItem>
                                      <SelectItem value="community">Community</SelectItem>
                                      <SelectItem value="affection">Affection</SelectItem>
                                      <SelectItem value="clean">Clean</SelectItem>
                                      <SelectItem value="maintenance">Maintenance</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div>
                                  <label className="text-sm font-medium"># of times</label>
                                  <input type="number" min={1} className="w-full p-2 border rounded-md" value={addTaskForm.times} onChange={(e) => setAddTaskForm(prev => ({ ...prev, times: Math.max(1, Number(e.target.value) || 1) }))} />
                                </div>
                                <div className="flex justify-end gap-2 pt-2">
                                  <Button variant="outline" size="sm" onClick={() => setAddListTaskOpen(false)}>Cancel</Button>
                                  <Button size="sm" onClick={() => {
                                    const name = addTaskForm.name.trim()
                                    if (!name) return
                                    const newTask = { name, area: addTaskForm.area as any, categories: [addTaskForm.category], status: 'Not started', cadence: newList.cadence, times: addTaskForm.times, count: 0 }
                                    // Prepend new task into the temporary list state
                                    setNewListTasks(prev => [newTask, ...(prev || [])])
                                    setAddTaskForm({ name: '', area: 'self', category: 'custom', times: 1 })
                                    setAddListTaskOpen(false)
                                  }}>Add</Button>
                                </div>
                              </div>
                            </PopoverContent>
                          </Popover>
                        </div>
                        <div className="border rounded-md overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="bg-muted/50 text-left">
                                <th className="p-2">Name</th>
                                <th className="p-2">Times</th>
                                <th className="p-2">Area</th>
                                <th className="p-2">Categories</th>
                                <th className="p-2 w-12 text-right"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {(newListTasks || []).map((task: any, idx: number) => (
                                <tr key={`${task.name}-${idx}`}>
                                  <td className="p-2">{task.name}</td>
                                  <td className="p-2">{task.times}</td>
                                  <td className="p-2 capitalize">{task.area}</td>
                                  <td className="p-2">{Array.isArray(task.categories) ? task.categories.join(', ') : ''}</td>
                                  <td className="p-2 text-right">
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" className="h-8 w-8 p-0">
                                          <span className="sr-only">Open menu</span>
                                          <MoreHorizontal className="h-4 w-4" />
                                        </Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end">
                                        <DropdownMenuItem onClick={() => {
                                          setNewListTasks(prev => (prev || []).map((t: any, i: number) => i === idx ? { ...t, times: (t.times || 1) + 1 } : t))
                                        }}>Edit</DropdownMenuItem>
                                        <DropdownMenuItem className="text-destructive" onClick={() => {
                                          setNewListTasks(prev => (prev || []).filter((_: any, i: number) => i !== idx))
                                        }}>Remove</DropdownMenuItem>
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={handleCreateListSubmit}
                    disabled={!newList.name.trim()}
                    size="sm"
                  >
                    {isEditingList ? 'Save List' : 'Create List'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowAddList(false)
                      setNewList({ name: '', templateId: '', budget: '', dueDate: '', cadence: 'one-off', role: 'custom', collaborators: [] })
                    }}
                    size="sm"
                  >
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Add New Template Form */}
          {showAddTemplate && (
            <Card className="mb-4 p-4">
              <CardHeader>
                <CardTitle className="text-sm">Create New Template</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <label className="text-sm font-medium">Name</label>
                  <input
                    type="text"
                    value={newTemplate.name}
                    onChange={(e) => setNewTemplate(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Enter template name..."
                    className="w-full p-2 border rounded-md"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="text-sm font-medium">Create from</label>
                    <Select value={newTemplate.createFrom} onValueChange={(val) => setNewTemplate(prev => ({ ...prev, createFrom: val, tasks: [] }))}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Choose a list to clone (optional)" />
                      </SelectTrigger>
                      <SelectContent>
                        {allTaskLists.map((lst: any) => (
                          <SelectItem key={`from-${lst.id}`} value={`list:${lst.id}`} textValue={lst.name || lst.role || 'List'}>
                            <div className="flex items-center gap-2">
                              <ListIcon className="h-4 w-4 opacity-70" />
                              <span>{lst.name || lst.role || 'List'}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Visibility</label>
                    <Select value={newTemplate.visibility} onValueChange={(val) => setNewTemplate(prev => ({ ...prev, visibility: val }))}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PRIVATE">Private</SelectItem>
                        <SelectItem value="PUBLIC">Public</SelectItem>
                        <SelectItem value="FRIENDS">Friends</SelectItem>
                        <SelectItem value="CLOSE_FRIENDS">Close friends</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Add quick task (moved above table) */}
                

                {/* Tasks preview/editor */}
                <div>
                  <Accordion type="single" collapsible>
                    <AccordionItem value="new-template-tasks">
                      <AccordionTrigger>Tasks</AccordionTrigger>
                      <AccordionContent>
                        <div className="flex justify-end mb-2">
                          <Popover open={addTaskOpen} onOpenChange={setAddTaskOpen}>
                            <PopoverTrigger asChild>
                              <Button variant="default">Add task</Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[320px]">
                              <div className="space-y-2">
                                <div>
                                  <label className="text-sm font-medium">Name</label>
                                  <input className="w-full p-2 border rounded-md" value={addTaskForm.name} onChange={(e) => setAddTaskForm(prev => ({ ...prev, name: e.target.value }))} />
                                </div>
                                <div>
                                  <label className="text-sm font-medium">Area</label>
                                  <Select value={addTaskForm.area} onValueChange={(val) => setAddTaskForm(prev => ({ ...prev, area: val }))}>
                                    <SelectTrigger className="w-full">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="self">Self</SelectItem>
                                      <SelectItem value="home">Home</SelectItem>
                                      <SelectItem value="social">Social</SelectItem>
                                      <SelectItem value="work">Work</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div>
                                  <label className="text-sm font-medium">Category</label>
                                  <Select value={addTaskForm.category} onValueChange={(val) => setAddTaskForm(prev => ({ ...prev, category: val }))}>
                                    <SelectTrigger className="w-full">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="custom">Custom</SelectItem>
                                      <SelectItem value="body">Body</SelectItem>
                                      <SelectItem value="mind">Mind</SelectItem>
                                      <SelectItem value="spirit">Spirit</SelectItem>
                                      <SelectItem value="fun">Fun</SelectItem>
                                      <SelectItem value="growth">Growth</SelectItem>
                                      <SelectItem value="community">Community</SelectItem>
                                      <SelectItem value="affection">Affection</SelectItem>
                                      <SelectItem value="clean">Clean</SelectItem>
                          <SelectItem value="maintenance">Maintenance</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div>
                                  <label className="text-sm font-medium"># of times</label>
                                  <input type="number" min={1} className="w-full p-2 border rounded-md" value={addTaskForm.times} onChange={(e) => setAddTaskForm(prev => ({ ...prev, times: Math.max(1, Number(e.target.value) || 1) }))} />
                                </div>
                                <div className="flex justify-end gap-2 pt-2">
                                  <Button variant="outline" size="sm" onClick={() => setAddTaskOpen(false)}>Cancel</Button>
                                  <Button size="sm" onClick={() => {
                                    const name = addTaskForm.name.trim()
                                    if (!name) return
                            const newTask = { name, area: addTaskForm.area as any, categories: [addTaskForm.category], status: 'Not started', cadence: 'daily', times: addTaskForm.times, count: 0 }
                                    setNewTemplate(prev => ({ ...prev, tasks: [...prev.tasks, newTask] }))
                                    setAddTaskForm({ name: '', area: 'self', category: 'custom', times: 1 })
                                    setAddTaskOpen(false)
                                  }}>Add</Button>
                                </div>
                              </div>
                            </PopoverContent>
                          </Popover>
                        </div>
                        <div className="border rounded-md overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="bg-muted/50 text-left">
                                <th className="p-2">Name</th>
                                <th className="p-2">Times</th>
                                <th className="p-2">Area</th>
                                <th className="p-2">Categories</th>
                                <th className="p-2 w-12 text-right"></th>
                              </tr>
                            </thead>
                              <tbody>
                              {newTemplateAggregatedTasks.map((task: any, idx: number) => (
                                <tr key={`${task.name}-${idx}`}>
                                  <td className="p-2">{task.name}</td>
                                  <td className="p-2">{task.times}</td>
                                  <td className="p-2 capitalize">{task.area}</td>
                                  <td className="p-2">{Array.isArray(task.categories) ? task.categories.join(', ') : ''}</td>
                                  <td className="p-2 text-right">
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" className="h-8 w-8 p-0">
                                          <span className="sr-only">Open menu</span>
                                          <MoreHorizontal className="h-4 w-4" />
                                        </Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end">
                                        <DropdownMenuItem onClick={() => {
                                          const updated = newTemplateAggregatedTasks.map((t: any, i: number) => i === idx ? { ...t, times: (t.times || 1) + 1 } : t)
                                          setNewTemplate(prev => ({ ...prev, tasks: updated }))
                                        }}>
                                          Edit
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => {
                                          const updated = newTemplateAggregatedTasks.filter((_: any, i: number) => i !== idx)
                                          setNewTemplate(prev => ({ ...prev, tasks: updated }))
                                        }} className="text-destructive">
                                          Remove
                                        </DropdownMenuItem>
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={async () => {
                      const tasks = newTemplate.tasks.length > 0 ? newTemplate.tasks : newTemplatePreviewTasks
                      const resp = await fetch('/api/v1/templates', {
                        method: 'POST',
                        body: JSON.stringify({
                          name: newTemplate.name,
                          tasks,
                          visibility: newTemplate.visibility
                        })
                      })
                      if (!resp.ok) return
                      setShowAddTemplate(false)
                      setNewTemplate({ name: '', createFrom: '', visibility: 'PRIVATE', tasks: [] })
                    }}
                    disabled={!newTemplate.name.trim()}
                    size="sm"
                  >
                    Create Template
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowAddTemplate(false)
                      setNewTemplate({ name: '', createFrom: '', visibility: 'PRIVATE', tasks: [] })
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
        const taskContactRefs = optimisticTaskContacts[action.name] || []
        const taskThingRefs = optimisticTaskThings[action.name] || []
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
                            // Update both optimistic and server state
                            setOptimisticTaskContacts(prev => ({
                              ...prev,
                              [action.name]: newContacts
                            }))
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
                                  // Optimistic update for immediate UI response
                                  setOptimisticTaskContacts(prev => ({
                                    ...prev,
                                    [action.name]: updatedContacts
                                  }))
                                  // Also update the server state
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
                            // Update both optimistic and server state
                            setOptimisticTaskThings(prev => ({
                              ...prev,
                              [action.name]: newThings
                            }))
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
                                  // Optimistic update for immediate UI response
                                  setOptimisticTaskThings(prev => ({
                                    ...prev,
                                    [action.name]: updatedThings
                                  }))
                                  // Also update the server state
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
                        // Update both optimistic and server state
                        setOptimisticTaskContacts(prev => ({
                          ...prev,
                          [action.name]: updatedContacts
                        }))
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
                        // Update both optimistic and server state
                        setOptimisticTaskThings(prev => ({
                          ...prev,
                          [action.name]: updatedThings
                        }))
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
    <p className="m-8 text-center">
      {t('tasks.yourEarnings', { timeframe: timeframe === "day" ? t('dashboard.today') : t('dashboard.thisWeek'), amount: earnings?.toLocaleString() })}
      {ticker !== undefined && ticker !== 0 && (
        <span className={`ml-2 flex items-center justify-center gap-1 ${ticker > 0 ? 'text-success' : 'text-destructive'}`}>
          {ticker > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          {Math.abs(ticker?.toFixed(1))}%
        </span>
      )}
    </p>


    {/* Only show insights for authenticated users */}
    {session?.user?.id && (
      <>
        <p className="mx-8 pt-8">{timeframe === "day" ? insight?.dayAnalysis : insight?.weekAnalysis}</p>
        <p className="mx-8 pt-8">{insight?.last3daysAnalysis}</p>
      </>
    )}
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