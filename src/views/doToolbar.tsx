'use client'

import React, { useContext, useMemo, useState, useEffect } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Plus, Pencil, DollarSign, Calendar as CalendarIcon, User as UserIcon, TrendingUp, Award } from 'lucide-react'
import { GlobalContext } from '@/lib/contexts'
import { useI18n } from '@/lib/contexts/i18n'
import { Badge } from '@/components/ui/badge'
import { Calendar } from '@/components/ui/calendar'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
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
  
  const allTaskLists = useMemo(() => 
    (stableTaskLists.length > 0 ? stableTaskLists : (Array.isArray(contextTaskLists) ? contextTaskLists : [])) as TaskList[],
    [stableTaskLists, contextTaskLists]
  )
  const selectedList = useMemo(() => {
    const found = allTaskLists.find((l:any) => l.id === selectedTaskListId)
    return found
  }, [allTaskLists, selectedTaskListId])

  const [userTemplates, setUserTemplates] = useState<any[]>([])
  const [collabProfiles, setCollabProfiles] = useState<Record<string, string>>({})
  const [listEarnings, setListEarnings] = useState<{ profit: number; prize: number; earnings: number }>({ profit: 0, prize: 0, earnings: 0 })

  // Calculate earnings for the selected list from user entries
  useEffect(() => {
    if (!selectedList || !session?.user) {
      setListEarnings({ profit: 0, prize: 0, earnings: 0 })
      return
    }

    try {
      const user = (session as any).user
      const entries = user?.entries || {}
      const listRole = (selectedList as any)?.role
      const listId = selectedList.id // Get listId for new structure
      
      if (!listRole || !listId) {
        setListEarnings({ profit: 0, prize: 0, earnings: 0 })
        return
      }

      let totalProfit = 0
      let totalPrize = 0
      let totalEarnings = 0

      // Determine list role type
      const rolePrefix = listRole.split('.')[0]
      const isDaily = rolePrefix === 'daily'
      const isWeekly = rolePrefix === 'weekly'
      const isOneOff = rolePrefix === 'one-off' || rolePrefix === 'oneoff'

      // For daily/weekly lists, filter by selectedDate if provided
      let targetDateISO: string | null = null
      let targetWeek: number | null = null
      let targetYear: number | null = null

      if (selectedDate && !isOneOff) {
        targetDateISO = selectedDate.toISOString().split('T')[0]
        targetYear = selectedDate.getFullYear()
        if (isWeekly) {
          const [, weekNum] = getWeekNumber(selectedDate)
          const weekNumber = typeof weekNum === 'number' ? weekNum : (typeof weekNum === 'string' ? parseInt(weekNum, 10) : null)
          targetWeek = weekNumber !== null && !isNaN(weekNumber) ? weekNumber : null
        }
      }

      // Helper to convert to number (handles both string and number for backward compatibility)
      const toNumber = (val: any): number => {
        if (typeof val === 'number') return val
        if (typeof val === 'string') return parseFloat(val) || 0
        return 0
      }

      // Sum up earnings from entries using new structure with listId
      for (const year in entries) {
        const yearData = entries[year]
        
        if (isDaily && yearData?.days) {
          // Sum daily earnings from new structure: days[date][listId]
          for (const date in yearData.days) {
            // If selectedDate is provided, only include that specific day
            if (targetDateISO && date !== targetDateISO) {
              continue
            }
            // If filtering by year, only include entries from that year
            if (targetYear && Number(year) !== targetYear) {
              continue
            }
            const dateEntry = yearData.days[date]
            if (dateEntry) {
              // Check new structure first: dateEntry[listId]
              if (dateEntry[listId]) {
                const listEntry = dateEntry[listId]
                totalProfit += toNumber(listEntry.profit)
                totalPrize += toNumber(listEntry.prize)
                totalEarnings += toNumber(listEntry.earnings)
              } else if (dateEntry.profit !== undefined || dateEntry.prize !== undefined || dateEntry.earnings !== undefined) {
                // Backward compatibility: old structure (dateEntry directly)
                totalProfit += toNumber(dateEntry.profit)
                totalPrize += toNumber(dateEntry.prize)
                totalEarnings += toNumber(dateEntry.earnings)
              }
            }
          }
        } else if (isWeekly && yearData?.weeks) {
          // Sum weekly earnings from new structure: weeks[week][listId]
          for (const week in yearData.weeks) {
            // If selectedDate is provided, only include that specific week
            if (targetWeek !== null && Number(week) !== targetWeek) {
              continue
            }
            // If filtering by year, only include entries from that year
            if (targetYear && Number(year) !== targetYear) {
              continue
            }
            const weekEntry = yearData.weeks[week]
            if (weekEntry) {
              // Check new structure first: weekEntry[listId]
              if (weekEntry[listId]) {
                const listEntry = weekEntry[listId]
                totalProfit += toNumber(listEntry.profit)
                totalPrize += toNumber(listEntry.prize)
                totalEarnings += toNumber(listEntry.earnings)
              } else if (weekEntry.profit !== undefined || weekEntry.prize !== undefined || weekEntry.earnings !== undefined) {
                // Backward compatibility: old structure (weekEntry directly)
                totalProfit += toNumber(weekEntry.profit)
                totalPrize += toNumber(weekEntry.prize)
                totalEarnings += toNumber(weekEntry.earnings)
              }
            }
          }
        } else if (isOneOff && yearData?.oneOffs) {
          // Sum one-off earnings from new structure: oneOffs[date][listId]
          // Always show total, not filtered by date
          for (const date in yearData.oneOffs) {
            const oneOffEntry = yearData.oneOffs[date]
            if (oneOffEntry) {
              // Check new structure first: oneOffEntry[listId]
              if (oneOffEntry[listId]) {
                const listEntry = oneOffEntry[listId]
                totalProfit += toNumber(listEntry.profit)
                totalPrize += toNumber(listEntry.prize)
                totalEarnings += toNumber(listEntry.earnings)
              } else if (oneOffEntry.profit !== undefined || oneOffEntry.prize !== undefined || oneOffEntry.earnings !== undefined) {
                // Backward compatibility: old structure (oneOffEntry directly)
                totalProfit += toNumber(oneOffEntry.profit)
                totalPrize += toNumber(oneOffEntry.prize)
                totalEarnings += toNumber(oneOffEntry.earnings)
              }
            }
          }
        }
      }

      setListEarnings({ profit: totalProfit, prize: totalPrize, earnings: totalEarnings })
    } catch (error) {
      console.error('Error calculating list earnings:', error)
      setListEarnings({ profit: 0, prize: 0, earnings: 0 })
    }
  }, [selectedList?.id, (selectedList as any)?.role, session, selectedDate])

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
        const owners: string[] = Array.isArray((selectedList as any)?.owners) ? (selectedList as any).owners : []
        const collaborators: string[] = Array.isArray((selectedList as any)?.collaborators) ? (selectedList as any).collaborators : []
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
  }, [selectedList?.id, JSON.stringify((selectedList as any)?.owners || []), JSON.stringify((selectedList as any)?.collaborators || [])])


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
            <h3 className="text-base font-semibold text-body">{selectedListTitle}</h3>
          </AccordionTrigger>
          <AccordionContent className="pt-3 pb-0">
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <Select value={selectedTaskListId} onValueChange={onChangeSelectedTaskListId}>
                  <SelectTrigger className="w-full sm:w-[260px]">
                    <SelectValue placeholder={t('tasks.selectList') || 'Select list'} />
                  </SelectTrigger>
                  <SelectContent>
                    {allTaskLists.map((tl:any) => (
                      <SelectItem key={tl.id} value={tl.id}>
                        {tl.name || tl.role || tl.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {shouldShowDatePicker && onDateChange && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full sm:w-[240px] justify-start text-left font-normal",
                          !selectedDate && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {formatDate(selectedDate)}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={selectedDate}
                        onSelect={onDateChange}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                )}

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
                  {/* Profit badge - show if there is a fixed budget */}
                  {(selectedList as any)?.budget && parseFloat(String((selectedList as any).budget || '0')) > 0 && (
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
                  {/* Show owner badge when there are collaborators */}
                  {Array.isArray((selectedList as any)?.collaborators) && (selectedList as any).collaborators.length > 0 && Array.isArray((selectedList as any)?.owners) && (selectedList as any).owners.map((id: string) => {
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
                  {Array.isArray((selectedList as any)?.collaborators) && (selectedList as any).collaborators.map((id: string) => {
                    const userName = collabProfiles[id] || id
                    const earnings = (selectedList as any)?.collaboratorEarnings?.[userName] || 0
                    return (
                      <Badge key={`collab-${id}`} className="bg-muted text-muted-foreground border-muted hover:bg-secondary/80">
                        <UserIcon className="h-3 w-3 mr-1" />
                        @{userName}{earnings > 0 ? `: $${earnings.toFixed(2)}` : ''}
                      </Badge>
                    )
                  })}
                </div>
              )}

            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  )
}


