'use client'

import React, { useContext, useMemo, useState, useEffect, useCallback, useRef, useImperativeHandle } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdownMenu'
import { Plus, Pencil, DollarSign, Calendar as CalendarIcon, User as UserIcon, TrendingUp, Award, CheckCircle2 } from 'lucide-react'
import { GlobalContext } from '@/lib/contexts'
import { useI18n } from '@/lib/contexts/i18n'
import { Badge } from '@/components/ui/badge'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { PercentageTicker } from '@/components/ui/percentageTicker'
import { DatePickerButton } from '@/components/ui/datePickerButton'


type TaskList = { id: string; name?: string; role?: string; tasks?: any[] }

// Helper to format date as YYYY-MM-DD
function formatDateISO(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// Helper to compare dates by value
function datesEqual(date1: Date | undefined, date2: Date | undefined): boolean {
  if (!date1 && !date2) return true
  if (!date1 || !date2) return false
  return date1.getTime() === date2.getTime()
}

// Helper to extract completed count from completion data structure
function getCompletedCount(dateData: any): number {
  if (!dateData) return 0
  if (Array.isArray(dateData)) {
    return dateData.filter((t: any) => t.status === 'done' || t.status === 'completed').length
  }
  if (Array.isArray(dateData.closedTasks)) {
    return dateData.closedTasks.length
  }
  return 0
}

// Helper to safely parse a number from various types
function safeParseNumber(value: unknown): number {
  if (typeof value === 'number') return value
  if (typeof value === 'string') return parseFloat(value) || 0
  return 0
}

export const DoToolbar = ({
  locale: _locale,
  selectedTaskListId,
  onChangeSelectedTaskListId,
  onAddEphemeral: _onAddEphemeral,
  selectedDate,
  onDateChange,
  onShowAddTask,
  onShowAddList,
  onShowAddTemplate,
  onShowEditList,
  hasFormOpen,
  onTaskCompletionOptimistic,
}: {
  locale: string
  selectedTaskListId?: string
  onChangeSelectedTaskListId: (id: string) => void
  onAddEphemeral: () => Promise<void> | void
  selectedDate?: Date
  onDateChange?: (date: Date | undefined) => void
  onShowAddTask?: () => void
  onShowAddList?: () => void
  onShowAddTemplate?: () => void
  onShowEditList?: () => void
  hasFormOpen?: boolean
  onTaskCompletionOptimistic?: (task?: { premium?: number; prize?: number; budget?: number }) => void
}) => {
  const { t } = useI18n()
  const { session, taskLists: contextTaskLists, refreshTaskLists, templates: contextTemplates, refreshTemplates, selectedDate: contextSelectedDate, setSelectedDate, setGlobalContext } = useContext(GlobalContext)

  // Track if we've initialized date from props
  const hasInitializedFromProps = useRef(false)
  useEffect(() => {
    if (selectedDate && !hasInitializedFromProps.current) {
      // Only initialize once from props
      if (!contextSelectedDate || !datesEqual(selectedDate, contextSelectedDate)) {
        setSelectedDate(selectedDate)
      }
      hasInitializedFromProps.current = true
    }
  }, [selectedDate]) // Only depend on selectedDate prop, not context
  
  // Notify parent component when context date changes (for backward compatibility)
  // Only notify if context date is different from prop date to avoid unnecessary calls
  useEffect(() => {
    if (onDateChange && contextSelectedDate && (!selectedDate || !datesEqual(contextSelectedDate, selectedDate))) {
      onDateChange(contextSelectedDate)
    }
  }, [contextSelectedDate]) // Only depend on contextSelectedDate to avoid loops
  
  // Use context selectedDate as the source of truth
  const selectedDateToUse = contextSelectedDate || selectedDate
  
  // Maintain stable task lists that never clear once loaded
  const [stableTaskLists, setStableTaskLists] = useState<TaskList[]>([])
  useEffect(() => {
    if (Array.isArray(contextTaskLists) && contextTaskLists.length > 0) {
      setStableTaskLists(contextTaskLists)
    }
  }, [contextTaskLists])
  
  // Helper function to get completion percentage from stored value for selected date
  const calculateCompletionPercentage = useCallback((list: any, date?: Date): number => {
    if (!list) return 0

    const targetDate = date || selectedDateToUse || new Date()
    const year = targetDate.getFullYear()
    const dateISO = formatDateISO(targetDate)

    // Helper to get completion from date bucket
    const getCompletionFromBucket = (bucket: any, dateKey: string): number | null => {
      const yearData = bucket?.[year] || {}
      const dateData = yearData[dateKey]
      if (!dateData) return null

      if (typeof dateData.completion === 'number') return dateData.completion

      // Calculate from task arrays
      const openCount = Array.isArray(dateData)
        ? dateData.filter((t: any) => t.status !== 'done' && t.status !== 'completed').length
        : (Array.isArray(dateData.openTasks) ? dateData.openTasks.length : 0)
      const closedCount = Array.isArray(dateData)
        ? dateData.filter((t: any) => t.status === 'done' || t.status === 'completed').length
        : (Array.isArray(dateData.closedTasks) ? dateData.closedTasks.length : 0)
      const total = openCount + closedCount
      return total > 0 ? (closedCount / total) * 100 : null
    }

    // Prefer job-based completion data, then fallback to legacy
    const jobCompletion = getCompletionFromBucket(list.jobCompletedTasks, dateISO)
    if (jobCompletion !== null) return jobCompletion

    const legacyCompletion = getCompletionFromBucket(list.completedTasks, dateISO)
    return legacyCompletion ?? 0
  }, [selectedDateToUse])

  // Helper function to calculate completion percentage change
  const calculateCompletionChange = useCallback((list: any): number => {
    if (!list) return 0

    // Use tasks from Task collection only
    const totalTasks = list.tasks?.length || 0

    if (totalTasks === 0) return 0

    const today = new Date()
    const year = today.getFullYear()
    const todayISO = formatDateISO(today)
    const yearData = list.completedTasks?.[year] || {}

    const currentCompleted = getCompletedCount(yearData[todayISO])

    // Find previous date's completion
    const previousDate = Object.keys(yearData).sort().reverse().find(d => d < todayISO)
    const previousCompleted = previousDate ? getCompletedCount(yearData[previousDate]) : 0

    return ((currentCompleted - previousCompleted) / totalTasks) * 100
  }, [])

  // Sort task lists according to specified priority
  const sortedTaskLists = useMemo(() => {
    const lists = (stableTaskLists.length > 0 ? stableTaskLists : (Array.isArray(contextTaskLists) ? contextTaskLists : [])) as TaskList[]
    
    const getListPriority = (list: any): { priority: number; sortValue?: number } => {
      const role = list.role || ''
      
      // Priority 1: default.daily
      if (role === 'default.daily') return { priority: 1 }
      
      // Priority 2: default.weekly
      if (role === 'default.weekly') return { priority: 2 }
      
      // Priority 3: daily.default
      if (role === 'daily.default') return { priority: 3 }
      
      // Priority 4: weekly.default
      if (role === 'weekly.default') return { priority: 4 }
      
      // Priority 5: dueDate less than a week (will be sorted by date within this group)
      if (list.dueDate) {
        try {
          const dueDate = new Date(list.dueDate)
          const now = new Date()
          const oneWeekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
          
          if (dueDate <= oneWeekFromNow && dueDate >= now) {
            // Return priority 5 with timestamp for sorting (earlier dates first)
            return { priority: 5, sortValue: dueDate.getTime() }
          }
        } catch (e) {
          // Invalid date, ignore
        }
      }
      
      // Priority 6: daily.* (but not daily.default which is already handled)
      if (role.startsWith('daily.') && role !== 'daily.default') return { priority: 6 }
      
      // Priority 7: weekly.* (but not weekly.default which is already handled)
      if (role.startsWith('weekly.') && role !== 'weekly.default') return { priority: 7 }
      
      // Priority 8: everything else
      return { priority: 8 }
    }
    
    return [...lists].sort((a, b) => {
      const priorityA = getListPriority(a)
      const priorityB = getListPriority(b)
      
      // First sort by priority
      if (priorityA.priority !== priorityB.priority) {
        return priorityA.priority - priorityB.priority
      }
      
      // Within same priority, if both have sortValue (dueDate items), sort by date
      if (priorityA.sortValue !== undefined && priorityB.sortValue !== undefined) {
        return priorityA.sortValue - priorityB.sortValue
      }
      
      // Otherwise maintain original order
      return 0
    })
  }, [stableTaskLists, contextTaskLists])
  
  const allTaskLists = sortedTaskLists
  const selectedList = useMemo(() => {
    const found = allTaskLists.find((l:any) => l.id === selectedTaskListId)
    return found
  }, [allTaskLists, selectedTaskListId])

  const [stableTemplates, setStableTemplates] = useState<any[]>([])
  const [collabProfiles, setCollabProfiles] = useState<Record<string, string>>({})
  const [listEarnings, setListEarnings] = useState<{ earnings: number; premium: number; totalGains: number }>({ earnings: 0, premium: 0, totalGains: 0 })
  const [dayData, setDayData] = useState<any>(null)
  const [optimisticEarnings, setOptimisticEarnings] = useState<{ earnings: number; premium: number }>({ earnings: 0, premium: 0 })
  const [optimisticCompletionDelta, setOptimisticCompletionDelta] = useState<number>(0)

  // Update stable templates only when context has valid data (never clear once we have data)
  useEffect(() => {
    if (Array.isArray(contextTemplates) && contextTemplates.length > 0) {
      setStableTemplates(contextTemplates)
    }
  }, [contextTemplates])

  const userTemplates = stableTemplates.length > 0 ? stableTemplates : (Array.isArray(contextTemplates) ? contextTemplates : [])

  // Fetch day data for the selected date
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      if (!selectedDateToUse || !session?.user) {
        setDayData(null)
        return
      }

      try {
        const dateISO = selectedDateToUse.toISOString().split('T')[0]
        const res = await fetch(`/api/v1/days?date=${dateISO}`)
        if (!cancelled && res.ok) {
          const data = await res.json()
          setDayData(data.day)
        } else {
          setDayData(null)
        }
      } catch (error) {
        console.error('Error fetching day data:', error)
        setDayData(null)
      }
    }
    run()
    return () => { cancelled = true }
  }, [selectedDateToUse, session?.user])

  // Calculate earnings for the selected list from day.ticker
  useEffect(() => {
    const resetEarnings = () => {
      setListEarnings({ earnings: 0, premium: 0, totalGains: 0 })
      setOptimisticEarnings({ earnings: 0, premium: 0 })
    }

    if (!selectedList?.id || !dayData) {
      resetEarnings()
      return
    }

    try {
      const tickers = Array.isArray(dayData.ticker) ? dayData.ticker : []
      const tickerEntries = tickers.filter((t: any) => t.listId === selectedList.id)

      const totals = tickerEntries.reduce(
        (acc: { earnings: number; premium: number }, entry: any) => ({
          earnings: acc.earnings + safeParseNumber(entry.earnings),
          premium: acc.premium + safeParseNumber(entry.premium)
        }),
        { earnings: 0, premium: 0 }
      )

      setListEarnings({ ...totals, totalGains: totals.earnings + totals.premium })
      setOptimisticEarnings({ earnings: 0, premium: 0 })
    } catch (error) {
      console.error('Error calculating list earnings from day.ticker:', error)
      resetEarnings()
    }
  }, [selectedList?.id, dayData])

  // Add optimistic earnings for a task completion
  // Uses task's premium and budget values from budgetDistribution directly
  const addOptimisticTaskEarnings = useCallback((task?: { premium?: number; earnings?: number; budget?: number }) => {
    if (!selectedList) return

    // Use task's actual premium and earnings values from budgetDistribution
    const premium = task?.premium || 0
    const earnings = task?.earnings || task?.budget || 0
    
    // Only add if there are actual values
    if (premium === 0 && earnings === 0) return
    
    // Add to optimistic earnings
    setOptimisticEarnings(prev => ({
      earnings: prev.earnings + earnings,
      premium: prev.premium + premium
    }))
    
    // Auto-clear after 5 seconds (safety timeout)
    setTimeout(() => {
      setOptimisticEarnings({ earnings: 0, premium: 0 })
    }, 5000)
  }, [selectedList])

  // Add optimistic completion percentage increase
  const addOptimisticCompletion = useCallback(() => {
    if (!selectedList) return

    // Use tasks from Task collection only
    const totalTasks = (selectedList.tasks || []).length

    if (totalTasks === 0) return

    // One more task completed = increase by (1/totalTasks * 100)
    const delta = (1 / totalTasks) * 100
    setOptimisticCompletionDelta(prev => prev + delta)

    // Clear after 5 seconds
    setTimeout(() => {
      setOptimisticCompletionDelta(0)
    }, 5000)
  }, [selectedList])

  // Combined optimistic callback for both earnings and completion
  const handleTaskCompletionOptimistic = useCallback((task?: { premium?: number; prize?: number; budget?: number }) => {
    addOptimisticTaskEarnings(task)
    addOptimisticCompletion()
  }, [addOptimisticTaskEarnings, addOptimisticCompletion])

  // Store functions in GlobalContext for task handlers to use
  useEffect(() => {
    if (setGlobalContext) {
      setGlobalContext((prev: any) => ({
        ...prev,
        addOptimisticTaskEarnings,
        addOptimisticCompletion,
        handleTaskCompletionOptimistic
      }))
    }
  }, [addOptimisticTaskEarnings, addOptimisticCompletion, handleTaskCompletionOptimistic, setGlobalContext])

  // Clear optimistic deltas when task lists refresh (real data arrived)
  useEffect(() => {
    if (contextTaskLists && contextTaskLists.length > 0) {
      setOptimisticCompletionDelta(0)
    }
  }, [contextTaskLists])


  // Fetch owner and collaborator profiles for badges
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        // Extract user IDs from users array (new model) or fallback to old fields
        const users = Array.isArray((selectedList as any)?.users) ? (selectedList as any).users : []
        const ownersFromUsers = users.filter((u: any) => u.role === 'OWNER').map((u: any) => u.userId)
        const collaboratorsFromUsers = users.filter((u: any) => u.role === 'COLLABORATOR' || u.role === 'MANAGER').map((u: any) => u.userId)
        
        // Fallback to old fields for backward compatibility
        const ownersFromOldField = Array.isArray((selectedList as any)?.owners) ? (selectedList as any).owners : []
        const collaboratorsFromOldField = Array.isArray((selectedList as any)?.collaborators) ? (selectedList as any).collaborators : []
        
        const owners = ownersFromUsers.length > 0 ? ownersFromUsers : ownersFromOldField
        const collaborators = collaboratorsFromUsers.length > 0 ? collaboratorsFromUsers : collaboratorsFromOldField
        const allIds = [...new Set([...owners, ...collaborators])]
        
        if (!allIds.length) { setCollabProfiles({}); return }
        const res = await fetch(`/api/v1/profiles/by-ids?ids=${encodeURIComponent(allIds.join(','))}`)
        if (!cancelled && res.ok) {
          const data = await res.json()
          const map: Record<string, string> = {}
          ;(data.profiles || []).forEach((p: any) => { map[p.userId] = p.userName || p.userId })
          setCollabProfiles(map)
        }
      } catch {}
    }
    run()
    return () => { cancelled = true }
  }, [selectedList?.id, JSON.stringify((selectedList as any)?.users || []), JSON.stringify((selectedList as any)?.owners || []), JSON.stringify((selectedList as any)?.collaborators || [])])


  // Determine if we should show the date picker (only for daily.* or weekly.* lists)
  const shouldShowDatePicker = useMemo(() => {
    if (!selectedList?.role) return false
    return selectedList.role.startsWith('daily.') || selectedList.role.startsWith('weekly.')
  }, [selectedList])

  // Determine if we should show the prize badge
  const shouldShowPrizeBadge = useMemo(() => {
    if (typeof (selectedList as any)?.budgetPercentage !== 'number' || (selectedList as any).budgetPercentage <= 0) {
      return false
    }
    const listRole = (selectedList as any)?.role
    const rolePrefix = listRole?.split('.')[0]
    const isDaily = rolePrefix === 'daily'
    const isWeekly = rolePrefix === 'weekly'
    const isOneOff = rolePrefix === 'one-off' || rolePrefix === 'oneoff'
    // For daily/weekly lists, only show prize when a date is selected
    // For one-off lists, always show the total prize
    return isOneOff || (selectedDateToUse && (isDaily || isWeekly))
  }, [selectedList, selectedDateToUse])

  const selectedListTitle = selectedList ? (selectedList.name || selectedList.role || selectedList.id) : (t('tasks.selectList') || 'Select list')

  // Control accordion to minimize when forms are open or when list changes
  const [accordionValue, setAccordionValue] = useState<string>('do-toolbar')
  
  useEffect(() => {
    if (hasFormOpen) {
      // Close accordion when forms open
      setAccordionValue('')
    }
    // Don't force open when forms close - let user control it manually
  }, [hasFormOpen])

  useEffect(() => {
    // Close accordion when a new list is selected
    setAccordionValue('')
  }, [selectedTaskListId])

  return (
    <div className="p-3 sm:p-4 border rounded-lg border-body w-full max-w-full bg-muted backdrop-blur-sm">
      <Accordion type="single" collapsible className="w-full" value={accordionValue} onValueChange={setAccordionValue}>
        <AccordionItem value="do-toolbar" className="border-none">
          <AccordionTrigger className="py-0 px-0 hover:no-underline">
            <div className="flex items-center justify-between w-full gap-2">
              <h3 className="text-base font-semibold text-body">{selectedListTitle}</h3>
              <DatePickerButton 
                shouldShow={shouldShowDatePicker}
                role={selectedList?.role}
              />
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-3 pb-0">
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <Select value={selectedTaskListId} onValueChange={onChangeSelectedTaskListId}>
                  <SelectTrigger className="w-full sm:w-[260px]">
                    <SelectValue placeholder={t('tasks.selectList') || 'Select list'}>
                      {selectedList ? (selectedList.name || selectedList.role || selectedList.id) : null}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {allTaskLists
                      .filter((tl: any) => {
                        // Use today's date for filtering dropdown items
                        const completionPercentage = calculateCompletionPercentage(tl, new Date())
                        return completionPercentage < 100
                      })
                      .map((tl:any) => {
                      const hasDueDate = tl.dueDate
                      let formattedDueDate: string | null = null
                      
                      if (hasDueDate) {
                        try {
                          const dueDate = new Date(tl.dueDate)
                          formattedDueDate = dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                        } catch (e) {
                          // If date parsing fails, use the raw value
                          formattedDueDate = tl.dueDate
                        }
                      }
                      
                      // Use today's date for dropdown items
                      const completionPercentage = calculateCompletionPercentage(tl, new Date())
                      
                      return (
                        <SelectItem key={tl.id} value={tl.id} className="group" textValue={tl.name || tl.role || tl.id}>
                          <div className="flex items-center justify-between w-full gap-2">
                            <span className="flex-1 truncate">{tl.name || tl.role || tl.id}</span>
                            <div className="flex items-center gap-2 shrink-0">
                              {completionPercentage > 0 && (
                                <Badge variant="outline" className="bg-muted text-muted-foreground border-muted hover:bg-secondary/80 shrink-0">
                                  <CheckCircle2 className="h-3 w-3 mr-1" />
                                  {completionPercentage.toFixed(0)}%
                                </Badge>
                              )}
                              {formattedDueDate && (
                                <Badge variant="outline" className="bg-muted text-muted-foreground border-muted hover:bg-secondary/80 shrink-0">
                                  <CalendarIcon className="h-3 w-3 mr-1" />
                                  {formattedDueDate}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>

                <div className="flex items-center gap-2 sm:ml-auto">
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
                      <DropdownMenuItem onClick={onShowAddTask}>
                        {t('common.newTask') || 'New task'}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={onShowAddList}>
                        {t('common.newList') || 'New list'}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={onShowAddTemplate}>
                        {t('common.newTemplate') || 'New template'}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <Button
                    variant="ghost"
                    size="sm"
                    className="flex items-center text-muted-foreground hover:text-foreground"
                    onClick={onShowEditList}
                    disabled={!selectedList}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Badges row: budget, budgetPercentage, due date, collaborators, earnings */}
              {selectedList && (
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Budget badge - show if budget is allocated (exists and > 0) */}
                  {(selectedList as any)?.budget && parseFloat(String((selectedList as any).budget || '0')) > 0 && (
                    <Badge variant="secondary" className="bg-muted text-muted-foreground border-muted hover:bg-secondary/80">
                      <DollarSign className="h-3 w-3 mr-1" />
                      Budget: ${parseFloat(String((selectedList as any).budget)).toFixed(2)}
                    </Badge>
                  )}
                  {/* Budget percentage badge - show if budgetPercentage is allocated */}
                  {typeof (selectedList as any)?.budgetPercentage === 'number' && (selectedList as any).budgetPercentage > 0 && (
                    <Badge variant="outline" className="bg-muted text-muted-foreground border-muted hover:bg-secondary/80">
                      {(selectedList as any).budgetPercentage.toFixed(0)}% of budget
                    </Badge>
                  )}
                  {/* Premium badge - show if budgetPercentage is allocated */}
                  {shouldShowPrizeBadge && (
                    <Badge variant="outline" className={optimisticEarnings.premium > 0 ? "bg-green-100 text-green-800 border-green-300 hover:bg-green-200 animate-pulse" : "bg-green-50 text-green-700 border-green-200 hover:bg-green-100"}>
                      <Award className="h-3 w-3 mr-1" />
                      Premium: ${(listEarnings.premium + optimisticEarnings.premium).toFixed(2)}
                    </Badge>
                  )}
                  {/* Earnings badge - show if there are earnings from ticker or optimistic */}
                  {(listEarnings.earnings > 0 || optimisticEarnings.earnings > 0) && (
                    <Badge variant="outline" className={optimisticEarnings.earnings > 0 ? "bg-blue-100 text-blue-800 border-blue-300 hover:bg-blue-200 animate-pulse" : "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"}>
                      <TrendingUp className="h-3 w-3 mr-1" />
                      Earnings: ${(listEarnings.earnings + optimisticEarnings.earnings).toFixed(2)}
                    </Badge>
                  )}
                  {(selectedList as any)?.dueDate && (
                    <Badge variant="outline" className="bg-muted text-muted-foreground border-muted hover:bg-secondary/80">
                      <CalendarIcon className="h-3 w-3 mr-1" />
                      {(selectedList as any).dueDate}
                    </Badge>
                  )}
                  {/* Show owner and collaborator badges from users array */}
                  {(() => {
                    const users = Array.isArray((selectedList as any)?.users) ? (selectedList as any).users : []
                    const owners = users.filter((u: any) => u.role === 'OWNER').map((u: any) => u.userId)
                    const collaborators = users.filter((u: any) => u.role === 'COLLABORATOR' || u.role === 'MANAGER').map((u: any) => u.userId)
                    
                    // Fallback to old fields for backward compatibility
                    const ownersFromOld = Array.isArray((selectedList as any)?.owners) ? (selectedList as any).owners : []
                    const collaboratorsFromOld = Array.isArray((selectedList as any)?.collaborators) ? (selectedList as any).collaborators : []
                    
                    const allOwners = owners.length > 0 ? owners : ownersFromOld
                    const allCollaborators = collaborators.length > 0 ? collaborators : collaboratorsFromOld
                    
                    return (
                      <>
                        {/* Show owner badges when there are collaborators */}
                        {allCollaborators.length > 0 && allOwners.map((id: string) => {
                    const userName = collabProfiles[id] || id
                    const earnings = (selectedList as any)?.collaboratorEarnings?.[userName] || 0
                    return (
                      <Badge key={`owner-${id}`} variant="default" className="bg-primary dark:bg-accent text-background hover:bg-foreground/90">
                        <UserIcon className="h-3 w-3 mr-1" />
                        @{userName}{earnings > 0 ? `: $${earnings.toFixed(2)}` : ''}
                      </Badge>
                    )
                  })}
                  {/* Show collaborator badges */}
                        {allCollaborators.map((id: string) => {
                    const userName = collabProfiles[id] || id
                    const earnings = (selectedList as any)?.collaboratorEarnings?.[userName] || 0
                    return (
                      <Badge key={`collab-${id}`} className="bg-muted text-muted-foreground border-muted hover:bg-secondary/80">
                        <UserIcon className="h-3 w-3 mr-1" />
                        @{userName}{earnings > 0 ? `: $${earnings.toFixed(2)}` : ''}
                      </Badge>
                    )
                  })}
                      </>
                    )
                  })()}
                  {/* Completion percentage badge with ticker */}
                  {selectedList && (
                    <>
                      <Badge
                        variant="outline"
                        className={optimisticCompletionDelta > 0
                          ? "bg-green-100 text-green-800 border-green-300 hover:bg-green-200 animate-pulse"
                          : "bg-muted text-muted-foreground border-muted hover:bg-secondary/80"
                        }
                      >
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        {Math.min(100, calculateCompletionPercentage(selectedList, selectedDateToUse) + optimisticCompletionDelta).toFixed(0)}%
                      </Badge>
                      <PercentageTicker value={calculateCompletionChange(selectedList)} />
                    </>
                  )}
                </div>
              )}

            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  )
}


