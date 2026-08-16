'use client'

import React, { useContext, useMemo, useState, useEffect, useRef } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdownMenu'
import { Plus, Pencil, DollarSign, User as UserIcon, TrendingUp, Award, CheckCircle2 } from 'lucide-react'
import { GlobalContext } from '@/lib/contexts'
import { useI18n } from '@/lib/contexts/i18n'
import { Badge } from '@/components/ui/badge'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { DatePickerButton } from '@/components/ui/datePickerButton'
import { useTaskLists } from '@/lib/hooks/useTaskLists'
import type { List, UserReference } from '@/generated/prisma'
import { useListEarnings } from '@/lib/hooks/useListEarnings'

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

export const DoToolbar = ({
  selectedTaskListId,
  onChangeSelectedTaskListId,
  selectedDate,
  onDateChange,
  onShowAddTask,
  onShowAddList,
  onShowEditList,
  hasFormOpen,
}: {
  selectedTaskListId?: string
  onChangeSelectedTaskListId: (id: string) => void
  selectedDate?: Date
  onDateChange?: (date: Date | undefined) => void
  onShowAddTask?: () => void
  onShowAddList?: () => void
  onShowEditList?: () => void
  hasFormOpen?: boolean
}) => {
  const { t } = useI18n()
  const { taskLists } = useTaskLists()
  const { selectedDate: contextSelectedDate, setSelectedDate } = useContext(GlobalContext)

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

  // Notify parent component when context date changes
  useEffect(() => {
    if (onDateChange && contextSelectedDate && (!selectedDate || !datesEqual(contextSelectedDate, selectedDate))) {
      onDateChange(contextSelectedDate)
    }
  }, [contextSelectedDate]) // Only depend on contextSelectedDate to avoid loops

  // Use context selectedDate as the source of truth
  const selectedDateToUse = contextSelectedDate || selectedDate

  // Sort task lists: defaults first, then by creation order
  const allTaskLists = useMemo(() => {
    const getListPriority = (list: List): number => {
      const role = list.role || ''
      if (role === 'default.daily') return 1
      if (role === 'default.weekly') return 2
      if (role === 'daily.default') return 3
      if (role === 'weekly.default') return 4
      if (role.startsWith('daily.')) return 5
      if (role.startsWith('weekly.')) return 6
      return 7
    }
    return [...taskLists].sort((a: List, b: List) => {
      const priorityA = getListPriority(a)
      const priorityB = getListPriority(b)
      if (priorityA !== priorityB) return priorityA - priorityB
      return 0
    })
  }, [taskLists])

  const selectedList = useMemo(
    () => allTaskLists.find((l: List) => l.id === selectedTaskListId),
    [allTaskLists, selectedTaskListId]
  )

  // Fetch accepted-job earnings for the selected list (cadence-scoped)
  const listEarnings = useListEarnings(selectedList?.id, selectedList?.role, selectedDateToUse)

  // Completion percentage for the selected date from job-based data
  const calculateCompletionPercentage = (list: List, date?: Date): number => {
    if (!list || !date) return 0
    const year = date.getFullYear()
    const dateISO = formatDateISO(date)
    const bucket = list.jobCompletedTasks?.[year] || {}
    return typeof bucket[dateISO]?.completion === 'number' ? bucket[dateISO].completion : 0
  }

  // Always show the Date / Day selector whenever a list is selected, so newly
  // created (custom) lists expose date navigation just like daily/weekly lists
  const shouldShowDatePicker = useMemo(() => Boolean(selectedList), [selectedList])

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
                role={selectedList?.role ?? undefined}
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
                    {allTaskLists.map((tl: List) => {
                      const completionPercentage = calculateCompletionPercentage(tl, new Date())
                      return (
                        <SelectItem key={tl.id} value={tl.id} className="group" textValue={tl.name || tl.role || tl.id}>
                          <div className="flex items-center justify-between w-full gap-2">
                            <span className="flex-1 truncate">{tl.name || tl.role || tl.id}</span>
                            {completionPercentage > 0 && (
                              <Badge variant="outline" className="bg-muted text-muted-foreground border-muted hover:bg-secondary/80 shrink-0">
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                {completionPercentage.toFixed(0)}%
                              </Badge>
                            )}
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

              {/* Badges row: budget, premium, earnings, collaborators, completion */}
              {selectedList && (
                <div className="flex items-center gap-2 flex-wrap">
                  {Number(selectedList.budget || 0) > 0 && (
                    <Badge variant="secondary" className="bg-muted text-muted-foreground border-muted hover:bg-secondary/80">
                      <DollarSign className="h-3 w-3 mr-1" />
                      Budget: ${Number(selectedList.budget).toFixed(2)}
                    </Badge>
                  )}
                  {selectedList.budgetType === 'PERCENT' && Number(selectedList.budgetPercent || 0) > 0 && (
                    <Badge variant="outline" className="bg-muted text-muted-foreground border-muted hover:bg-secondary/80">
                      {Number(selectedList.budgetPercent).toFixed(0)}% of budgets
                    </Badge>
                  )}
                  {(listEarnings.premium > 0 || Number(selectedList.budget || 0) > 0) && (
                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 hover:bg-green-100">
                      <Award className="h-3 w-3 mr-1" />
                      Premium: ${listEarnings.premium.toFixed(2)}
                    </Badge>
                  )}
                  {listEarnings.earnings > 0 && (
                    <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100">
                      <TrendingUp className="h-3 w-3 mr-1" />
                      Earnings: ${listEarnings.earnings.toFixed(2)}
                    </Badge>
                  )}
                  {/* Owner and collaborator badges */}
                  {(() => {
                    const users = Array.isArray(selectedList.users) ? selectedList.users : []
                    const owners = users.filter((u: UserReference) => u.role === 'OWNER')
                    const collaborators = users.filter((u: UserReference) => u.role === 'COLLABORATOR' || u.role === 'MANAGER')
                    const renderUserBadge = (ref: UserReference & { userName?: string | null }, isOwner: boolean) => (
                      <Badge
                        key={`${isOwner ? 'owner' : 'collab'}-${ref.userId}`}
                        variant={isOwner ? 'default' : undefined}
                        className={isOwner
                          ? 'bg-primary dark:bg-accent text-background hover:bg-foreground/90'
                          : 'bg-muted text-muted-foreground border-muted hover:bg-secondary/80'
                        }
                      >
                        <UserIcon className="h-3 w-3 mr-1" />
                        @{ref.userName || ref.userId.slice(0, 8)}...
                      </Badge>
                    )
                    return (
                      <>
                        {owners.map((u: UserReference) => renderUserBadge(u, true))}
                        {collaborators.map((u: UserReference) => renderUserBadge(u, false))}
                      </>
                    )
                  })()}
                  <Badge
                    variant="outline"
                    className="bg-muted text-muted-foreground border-muted hover:bg-secondary/80"
                  >
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    {Math.min(100, calculateCompletionPercentage(selectedList, selectedDateToUse)).toFixed(0)}%
                  </Badge>
                </div>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  )
}
