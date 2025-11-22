'use client'

import React, { useContext, useMemo, useState, useEffect, useCallback } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdownMenu'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Plus, Pencil, DollarSign, Calendar as CalendarIcon, User as UserIcon, TrendingUp, Award, CheckCircle2 } from 'lucide-react'
import { GlobalContext } from '@/lib/contexts'
import { useI18n } from '@/lib/contexts/i18n'
import { Badge } from '@/components/ui/badge'
import { Calendar } from '@/components/ui/calendar'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { PercentageTicker } from '@/components/ui/percentageTicker'
import { cn } from '@/lib/utils'
import { getWeekNumber } from '@/app/helpers'

type TaskList = { id: string; name?: string; role?: string }

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
}) => {
  const { t } = useI18n()
  const { session, taskLists: contextTaskLists, refreshTaskLists } = useContext(GlobalContext)
  
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
    
    // Use the selected date or default to today
    const targetDate = date || selectedDate || new Date()
    const year = targetDate.getFullYear()
    const dateISO = `${year}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(targetDate.getDate()).padStart(2, '0')}`
    
    if (list.completedTasks) {
      const completedTasks = list.completedTasks
      const yearData = completedTasks[year] || {}
      const dateData = yearData[dateISO]
      
      if (dateData) {
        // First check if completion is stored directly in the date bucket
        if (typeof dateData.completion === 'number') {
          return dateData.completion
        }
        
        // Fallback: calculate from openTasks and closedTasks
        let openTasks: any[] = []
        let closedTasks: any[] = []
        
        if (Array.isArray(dateData)) {
          // Legacy structure
          openTasks = dateData.filter((t: any) => t.status !== 'done')
          closedTasks = dateData.filter((t: any) => t.status === 'done')
        } else {
          // New structure
          openTasks = Array.isArray(dateData.openTasks) ? dateData.openTasks : []
          closedTasks = Array.isArray(dateData.closedTasks) ? dateData.closedTasks : []
        }
        
        const totalTasks = openTasks.length + closedTasks.length
        if (totalTasks > 0) {
          return (closedTasks.length / totalTasks) * 100
        }
      }
    }
    
    return 0
  }, [selectedDate])

  // Helper function to calculate completion percentage change
  const calculateCompletionChange = useCallback((list: any): number => {
    if (!list) return 0
    
    // Get base tasks count
    const baseTasks = list.tasks?.length || list.templateTasks?.length || 0
    
    // Get ephemeral tasks
    const ephemeralTasks = list.ephemeralTasks || {}
    const openEphemeral = Array.isArray(ephemeralTasks.open) ? ephemeralTasks.open.length : 0
    const closedEphemeral = Array.isArray(ephemeralTasks.closed) ? ephemeralTasks.closed.length : 0
    const totalEphemeral = openEphemeral + closedEphemeral
    
    // Total tasks = base tasks + ephemeral tasks
    const totalTasks = baseTasks + totalEphemeral
    
    if (totalTasks === 0) return 0
    
    // Get today's date
    const today = new Date()
    const year = today.getFullYear()
    const todayISO = `${year}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    
    // Get current date's completion data for base tasks
    let currentBaseCompleted = 0
    if (list.completedTasks) {
      const completedTasks = list.completedTasks
      const yearData = completedTasks[year] || {}
      const todayData = yearData[todayISO]
      
      if (todayData) {
        if (Array.isArray(todayData)) {
          // Legacy structure
          currentBaseCompleted = todayData.filter((t: any) => t.status === 'done').length
        } else if (todayData.closedTasks) {
          // New structure
          currentBaseCompleted = Array.isArray(todayData.closedTasks) ? todayData.closedTasks.length : 0
        }
      }
    }
    
    // Find previous entry (previous date) for base tasks
    let previousBaseCompleted = 0
    if (list.completedTasks) {
      const completedTasks = list.completedTasks
      const yearData = completedTasks[year] || {}
      const dates = Object.keys(yearData).sort().reverse() // Sort dates descending
      const previousDate = dates.find((date: string) => date < todayISO)
      
      if (previousDate) {
        const previousData = yearData[previousDate]
        if (previousData) {
          if (Array.isArray(previousData)) {
            // Legacy structure
            previousBaseCompleted = previousData.filter((t: any) => t.status === 'done').length
          } else if (previousData.closedTasks) {
            // New structure
            previousBaseCompleted = Array.isArray(previousData.closedTasks) ? previousData.closedTasks.length : 0
          }
        }
      }
    }
    
    // Calculate base tasks change (day-over-day comparison)
    const baseTasksChange = totalTasks > 0 
      ? ((currentBaseCompleted - previousBaseCompleted) / totalTasks) * 100 
      : 0
    
    // Calculate ephemeral tasks change
    // When an ephemeral task is completed, increment = 1 / (remaining open ephemeral + base tasks + 1) * 100
    // This represents the percentage point increase when one ephemeral task is completed
    // The +1 accounts for the task that was just completed
    // We need to calculate the increment based on the current state (after completion)
    let ephemeralChange = 0
    if (closedEphemeral > 0) {
      // The increment is calculated as: 1 / (remaining open ephemeral + base tasks + 1) * 100
      // This gives us the percentage point increase for completing one ephemeral task
      const denominator = openEphemeral + baseTasks + 1
      if (denominator > 0) {
        ephemeralChange = (1 / denominator) * 100
      }
    }
    
    // Total change = base tasks change + ephemeral tasks change
    return baseTasksChange + ephemeralChange
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

  const [userTemplates, setUserTemplates] = useState<any[]>([])
  const [collabProfiles, setCollabProfiles] = useState<Record<string, string>>({})
  const [listEarnings, setListEarnings] = useState<{ profit: number; prize: number; earnings: number }>({ profit: 0, prize: 0, earnings: 0 })
  const [dayData, setDayData] = useState<any>(null)

  // Fetch day data for the selected date
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      if (!selectedDate || !session?.user) {
        setDayData(null)
        return
      }

      try {
        const dateISO = selectedDate.toISOString().split('T')[0]
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
  }, [selectedDate, session?.user])

  // Calculate earnings for the selected list from day.ticker
  useEffect(() => {
    if (!selectedList) {
      setListEarnings({ profit: 0, prize: 0, earnings: 0 })
      return
    }

    try {
      const listId = selectedList.id
      if (!listId) {
        setListEarnings({ profit: 0, prize: 0, earnings: 0 })
        return
      }

      // If no dayData, set earnings to 0
      if (!dayData) {
        setListEarnings({ profit: 0, prize: 0, earnings: 0 })
        return
      }

      // Get ticker array from day data
      const tickers = Array.isArray(dayData.ticker) ? dayData.ticker : []
      
      // Find all ticker entries for this listId and sum them up
      const tickerEntries = tickers.filter((t: any) => t.listId === listId)
      
      // Sum all profit and prize values from all ticker entries
      let totalProfit = 0
      let totalPrize = 0
      
      tickerEntries.forEach((tickerEntry: any) => {
        const profit = typeof tickerEntry.profit === 'number' ? tickerEntry.profit : (typeof tickerEntry.profit === 'string' ? parseFloat(tickerEntry.profit) || 0 : 0)
        const prize = typeof tickerEntry.prize === 'number' ? tickerEntry.prize : (typeof tickerEntry.prize === 'string' ? parseFloat(tickerEntry.prize) || 0 : 0)
        totalProfit += profit
        totalPrize += prize
      })
      
      const earnings = totalProfit + totalPrize
      setListEarnings({ profit: totalProfit, prize: totalPrize, earnings })
    } catch (error) {
      console.error('Error calculating list earnings from day.ticker:', error)
      setListEarnings({ profit: 0, prize: 0, earnings: 0 })
    }
  }, [selectedList?.id, dayData])

  const refreshTemplates = async () => {
    try {
      const res = await fetch('/api/v1/templates')
      if (res.ok) {
        const data = await res.json()
        setUserTemplates(data.templates || [])
      }
    } catch {}
  }

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      if (cancelled) return
      await refreshTemplates()
    }
    run()
    return () => { cancelled = true }
  }, [])

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
    return isOneOff || (selectedDate && (isDaily || isWeekly))
  }, [selectedList, selectedDate])

  // Format date for display
  const formatDate = (date: Date | undefined) => {
    if (!date) return t('tasks.selectDate')
    
    // For weekly lists, show week number
    if (selectedList?.role && selectedList.role.startsWith('weekly.')) {
      const [, weekNum] = getWeekNumber(date)
      return `Week ${weekNum}, ${date.getFullYear()}`
    }
    
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

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
              {shouldShowDatePicker && onDateChange && (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className={cn(
                        "justify-start text-left font-normal shrink-0",
                        !selectedDate && "text-muted-foreground"
                      )}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {formatDate(selectedDate)}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="end">
                    <Calendar
                      mode="single"
                      selected={selectedDate}
                      onSelect={onDateChange}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              )}
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
                  {/* Prize badge - show if budgetPercentage is allocated */}
                  {shouldShowPrizeBadge && (
                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 hover:bg-green-100">
                      <Award className="h-3 w-3 mr-1" />
                      Prize: ${listEarnings.prize.toFixed(2)}
                    </Badge>
                  )}
                  {/* Profit badge - show if there is profit from ticker */}
                  {listEarnings.profit > 0 && (
                    <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100">
                      <TrendingUp className="h-3 w-3 mr-1" />
                      Profit: ${listEarnings.profit.toFixed(2)}
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
                      <Badge variant="outline" className="bg-muted text-muted-foreground border-muted hover:bg-secondary/80">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        {calculateCompletionPercentage(selectedList, selectedDate).toFixed(0)}%
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


