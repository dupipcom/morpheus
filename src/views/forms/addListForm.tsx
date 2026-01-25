'use client'

import React, { useMemo, useState, useEffect, useContext } from 'react'
import useSWR from 'swr'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { Badge } from '@/components/ui/badge'
import { Slider } from '@/components/ui/slider'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Package, List as ListIcon, MoreHorizontal, ChevronDown, Calendar as CalendarIcon, Percent, DollarSign } from 'lucide-react'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { useI18n } from '@/lib/contexts/i18n'
import { GlobalContext } from '@/lib/contexts'
import { useFriendProfiles } from '@/lib/hooks/useFriendProfiles'
import { BudgetDistributionInput } from '@/components/budgetDistributionInput'
import { 
  BudgetDistribution, 
  AllocationType, 
  EntityBudgetAllocation,
  EntityAllocationsType,
  getAllocationNominal,
  nominalToPercent
} from '@/lib/utils/budgetDistributionUtils'
import { calculatePrizePool, calculateBudgetPercentageFromCurrency } from '@/lib/utils/earningsUtils'

type Collaborator = { id: string, userName: string }

// Extended entity budget state to store both nominal and percent values
interface EntityBudgetState {
  budget: AllocationType
  premium: AllocationType
}

export const AddListForm = ({
  open,
  onOpenChange,
  allTaskLists,
  userTemplates,
  isEditing,
  initialList,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  allTaskLists: any[]
  userTemplates: any[]
  isEditing: boolean
  initialList?: any
  onCreated: (newListId?: string) => Promise<void> | void
}) => {
  const { t } = useI18n()
  const { session } = useContext(GlobalContext)
  const [form, setForm] = useState({
    name: '',
    templateId: '',
    budget: '0',
    budgetPercentage: 0,
    dueDate: '',
    cadence: 'one-off',
    role: 'custom',
    collaborators: [] as Collaborator[],
  })
  const [dueDateObj, setDueDateObj] = useState<Date | undefined>(undefined)
  const [dateOpen, setDateOpen] = useState(false)
  const [collabQuery, setCollabQuery] = useState('')
  const [addTaskOpen, setAddTaskOpen] = useState(false)
  const [addTaskForm, setAddTaskForm] = useState({ name: '', area: 'self', category: 'custom', times: 1 })
  const [tasks, setTasks] = useState<any[]>([])
  const [remainingBudget, setRemainingBudget] = useState<number>(100)
  const [maxAllowedBudget, setMaxAllowedBudget] = useState<number>(100)
  const [premiumPercentage, setPremiumPercentage] = useState<number>(0) // % of budgetPercentage allocated to premium
  const [budgetDistributionMode, setBudgetDistributionMode] = useState<'equal' | 'area' | 'category' | 'task'>('equal')
  const [areaDistribution, setAreaDistribution] = useState<Record<string, AllocationType>>({})
  const [areaDistributionMode, setAreaDistributionMode] = useState<'percentage' | 'currency'>('percentage')
  const [areaPremiumDistribution, setAreaPremiumDistribution] = useState<Record<string, AllocationType>>({})
  const [areaPremiumDistributionMode, setAreaPremiumDistributionMode] = useState<'percentage' | 'currency'>('percentage')
  const [categoryDistribution, setCategoryDistribution] = useState<Record<string, AllocationType>>({})
  const [categoryDistributionMode, setCategoryDistributionMode] = useState<'percentage' | 'currency'>('percentage')
  const [categoryPremiumDistribution, setCategoryPremiumDistribution] = useState<Record<string, AllocationType>>({})
  const [categoryPremiumDistributionMode, setCategoryPremiumDistributionMode] = useState<'percentage' | 'currency'>('percentage')
  const [taskBudgets, setTaskBudgets] = useState<Record<string, EntityBudgetState>>({})
  const [budgetPercentageMode, setBudgetPercentageMode] = useState<'percentage' | 'currency'>('percentage')
  const [personalBudgetAllocation, setPersonalBudgetAllocation] = useState<Record<string, AllocationType>>({})

  // Get user equity for currency calculations
  const userEquity = session?.user?.equity || 0

  // Determine if budget/prize fields should be disabled
   const isBudgetDisabled = !form.budget || parseFloat(form.budget) <= 0
   const isPremiumDisabled = form.budgetPercentage <= 0 || userEquity <= 0

  // Load initial list data when editing
  useEffect(() => {
    if (initialList) {
      // Split role like "daily.default" into cadence and role
      const fullRole = initialList.role || 'one-off.custom'
      const [cadencePart, rolePart] = fullRole.includes('.') ? fullRole.split('.') : ['one-off', fullRole]
      
      // Format budget to preserve decimal places (up to 2 decimal places)
      let budgetValue = ''
      if (initialList.budget != null) {
        const budgetNum = typeof initialList.budget === 'number' ? initialList.budget : parseFloat(String(initialList.budget))
        if (!isNaN(budgetNum)) {
          // Check if the number has decimal places
          const hasDecimals = budgetNum % 1 !== 0
          budgetValue = hasDecimals ? budgetNum.toFixed(2) : String(budgetNum)
        }
      }
      
      setForm({
        name: initialList.name || '',
        templateId: isEditing ? '' : (initialList.templateId ? `template:${initialList.templateId}` : ''),
        budget: budgetValue,
        budgetPercentage: initialList.budgetPercentage || 0,
        dueDate: initialList.dueDate || '',
        cadence: cadencePart || 'one-off',
        role: rolePart || 'custom',
        collaborators: (initialList.collaborators || []).map((id: string) => ({ id, userName: id }))
      })
      
      // Load budget distribution settings
      if (initialList.premiumPercentage != null) {
        setPremiumPercentage(initialList.premiumPercentage)
      }
      
      if (initialList.budgetDistribution) {
        const dist = initialList.budgetDistribution
        
        // Helper to parse EntityAllocationsType array to AllocationType Records
        const parseEntityAllocations = (allocations: any[]): { 
          budgets: Record<string, AllocationType>
          premiums: Record<string, AllocationType> 
        } => {
          const budgets: Record<string, AllocationType> = {}
          const premiums: Record<string, AllocationType> = {}
          
          if (Array.isArray(allocations)) {
            allocations.forEach((item: any) => {
              const entityId = item.entityId
              if (entityId) {
                const budgetAlloc = item.allocation?.budget
                const prizeAlloc = item.allocation?.premium
                
                if (budgetAlloc) {
                  budgets[entityId] = { nominal: budgetAlloc.nominal, percent: budgetAlloc.percent }
                }
                if (prizeAlloc) {
                  premiums[entityId] = { nominal: prizeAlloc.nominal, percent: prizeAlloc.percent }
                }
              }
            })
          }
          
          return { budgets, premiums }
        }
        
        if (dist.areas && Array.isArray(dist.areas) && dist.areas.length > 0) {
          const { budgets, premiums } = parseEntityAllocations(dist.areas)
          setAreaDistribution(budgets)
          setAreaPremiumDistribution(premiums)
          setBudgetDistributionMode('area')
        } else if (dist.categories && Array.isArray(dist.categories) && dist.categories.length > 0) {
          const { budgets, premiums } = parseEntityAllocations(dist.categories)
          setCategoryDistribution(budgets)
          setCategoryPremiumDistribution(premiums)
          setBudgetDistributionMode('category')
        } else if (dist.tasks && Array.isArray(dist.tasks) && dist.tasks.length > 0) {
          const taskBudgetsData: Record<string, EntityBudgetState> = {}
          
          dist.tasks.forEach((item: any) => {
            const taskId = item.entityId
            if (taskId) {
              const budgetAlloc = item.allocation?.budget
              const prizeAlloc = item.allocation?.premium
              
              taskBudgetsData[taskId] = {
                budget: typeof budgetAlloc === 'object' 
                  ? { nominal: budgetAlloc?.nominal, percent: budgetAlloc?.percent }
                  : { nominal: typeof budgetAlloc === 'number' ? budgetAlloc : 0 },
                premium: typeof prizeAlloc === 'object'
                  ? { nominal: prizeAlloc?.nominal, percent: prizeAlloc?.percent }
                  : { nominal: typeof prizeAlloc === 'number' ? prizeAlloc : 0 }
              }
            }
          })
          
          setTaskBudgets(taskBudgetsData)
          setBudgetDistributionMode('task')
        }
      }
      
      // Always fetch from Task collection when editing to get the latest data
      // The initialList.tasks may be stale or from a previous fetch
      if (isEditing && initialList.id) {
        // Fetch tasks from Task collection (primary source of truth)
        fetch(`/api/v1/tasks?listId=${initialList.id}`)
          .then(res => res.ok ? res.json() : null)
          .then(data => {
            if (data?.tasks && Array.isArray(data.tasks)) {
              setTasks(data.tasks)
            }
            // If API returns no tasks, keep tasks empty - don't fall back to stale data
          })
          .catch(err => {
            console.error('Error fetching tasks:', err)
            // On error, use initialList.tasks as fallback (from server-side render)
            const fallbackTasks = (Array.isArray(initialList.tasks) && initialList.tasks.length > 0)
              ? initialList.tasks
              : []
            setTasks(fallbackTasks)
          })
      } else {
        // When creating new list: use tasks from selected template/list if available
        const tasksToLoad = (Array.isArray(initialList.tasks) && initialList.tasks.length > 0)
          ? initialList.tasks
          : []
        setTasks(tasksToLoad)
      }
      
      setDueDateObj(initialList.dueDate ? new Date(initialList.dueDate) : undefined)
    }
  }, [JSON.stringify(initialList), isEditing])

  // Calculate available budget dynamically from all task lists
  useEffect(() => {
    try {
      // Calculate total budget used by all lists
      const totalUsed = allTaskLists.reduce((sum, list: any) => {
        return sum + (list.budgetPercentage || 0)
      }, 0)

      // Calculate total used by OTHER lists (excluding current list if editing)
      const totalUsedByOthers = allTaskLists.reduce((sum, list: any) => {
        // Skip the current list if editing
        if (isEditing && initialList?.id && list.id === initialList.id) {
          return sum
        }
        return sum + (list.budgetPercentage || 0)
      }, 0)

      // Remaining budget is what's left after all allocations
      const remaining = Math.max(0, 100 - totalUsed)
      
      // When editing: max = remaining + current list's allocation
      // When creating: max = remaining
      const currentListBudget = initialList?.budgetPercentage || 0
      const maxAllowed = Math.max(0, 100 - totalUsedByOthers)

      setRemainingBudget(remaining)
      setMaxAllowedBudget(maxAllowed)
    } catch (error) {
      console.error('Error calculating budget info:', error)
      setRemainingBudget(100)
      setMaxAllowedBudget(100)
    }
  }, [allTaskLists, initialList?.id, initialList?.budgetPercentage, isEditing])

  // Resolve collaborator usernames for existing lists (replace id placeholders)
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        const unresolved = (form.collaborators || []).filter((c) => !c.userName || c.userName === c.id)
        if (unresolved.length === 0) return
        const ids = unresolved.map((c) => c.id)
        const res = await fetch(`/api/v1/profiles/by-ids?ids=${encodeURIComponent(ids.join(','))}`)
        if (!cancelled && res.ok) {
          const data = await res.json()
          const idToUserName: Record<string, string> = {}
          ;(data.profiles || []).forEach((p: any) => { idToUserName[p.userId] = p.userName || p.userId })
          setForm((prev) => ({
            ...prev,
            collaborators: (prev.collaborators || []).map((c) => ({ ...c, userName: idToUserName[c.id] || c.userName }))
          }))
        }
      } catch {}
    }
    run()
    return () => { cancelled = true }
  }, [JSON.stringify((form.collaborators || []).map((c) => c.id))])

  const newListPreviewTasks = useMemo(() => {
    if (!form.templateId) return null // Return null instead of empty array when no template
    if (form.templateId.startsWith('template:')) {
      const tplId = form.templateId.split(':')[1]
      const tpl = userTemplates.find((t: any) => t.id === tplId)
      return Array.isArray(tpl?.tasks) ? tpl.tasks : []
    }
    if (form.templateId.startsWith('list:')) {
      const lstId = form.templateId.split(':')[1]
      const lst = allTaskLists.find((l: any) => l.id === lstId)
      return Array.isArray(lst?.tasks) ? lst.tasks : []
    }
    return [] as any[]
  }, [form.templateId, userTemplates, allTaskLists])

  useEffect(() => {
    if (!isEditing && newListPreviewTasks !== null) {
      setTasks(newListPreviewTasks)
    }
  }, [newListPreviewTasks, isEditing])

  // Memoize trimmed query to avoid unnecessary SWR re-fetches
  const trimmedCollabQuery = useMemo(() => collabQuery.trim(), [collabQuery])
  
  // Use SWR hook for fetching profiles - handles caching, deduplication, and revalidation
  // When query is empty (null), fetches default profiles (close friends, friends, public)
  // When query has value, fetches search results matching the query
  const { profiles: collabResults } = useFriendProfiles(trimmedCollabQuery || null)

  const handleSubmit = async () => {
    const roleJoined = `${form.cadence}.${form.role}`
    let templateIdToLink: string | undefined
    if (!isEditing && form.templateId?.startsWith('template:')) templateIdToLink = form.templateId.split(':')[1]
    // Parse budget as float, default to undefined if empty or invalid
    const budgetValue = form.budget && form.budget.trim() !== '' 
      ? parseFloat(form.budget) 
      : undefined
    
    // Build budget distribution object with EntityAllocationsType arrays
    const budgetDistribution: BudgetDistribution = {}
    
    // Build area distribution with EntityAllocationsType array
    if (budgetDistributionMode === 'area' && Object.keys(areaDistribution).length > 0) {
      const prizePool = calculatePrizePool(form.budgetPercentage, userEquity)
      const areaAllocations: EntityAllocationsType[] = []
      
      Object.entries(areaDistribution).forEach(([area, budgetAlloc]) => {
      // Get premium allocation for this area if it exists
      const prizeAlloc = areaPremiumDistribution[area] || { nominal: 0, percent: 0 }
        
        areaAllocations.push({
          entityId: area,
          entityType: 'lists',
          entitySubtype: 'area',
          allocation: { budget: budgetAlloc, premium: prizeAlloc }
        })
      })
      
      budgetDistribution.areas = areaAllocations
    }
    
    // Build category distribution with EntityAllocationsType array
    if (budgetDistributionMode === 'category' && Object.keys(categoryDistribution).length > 0) {
      const prizePool = calculatePrizePool(form.budgetPercentage, userEquity)
      const categoryAllocations: EntityAllocationsType[] = []
      
      Object.entries(categoryDistribution).forEach(([category, budgetAlloc]) => {
      // Get premium allocation for this category if it exists
      const prizeAlloc = categoryPremiumDistribution[category] || { nominal: 0, percent: 0 }
        
        categoryAllocations.push({
          entityId: category,
          entityType: 'lists',
          entitySubtype: 'categories',
          allocation: { budget: budgetAlloc, premium: prizeAlloc }
        })
      })
      
      budgetDistribution.categories = categoryAllocations
    }
    
    // Build per-task distribution with EntityAllocationsType array
    if (budgetDistributionMode === 'task' && Object.keys(taskBudgets).length > 0) {
      const taskAllocations: EntityAllocationsType[] = []
      
      Object.entries(taskBudgets).forEach(([taskId, values]) => {
        const budgetAlloc = values.budget
      const prizeAlloc = values.premium
        
        // Check if there's any meaningful allocation
        const hasBudget = (budgetAlloc.nominal ?? 0) > 0 || (budgetAlloc.percent ?? 0) > 0
        const hasPrize = (prizeAlloc.nominal ?? 0) > 0 || (prizeAlloc.percent ?? 0) > 0
        
          if (hasBudget || hasPrize) {
          taskAllocations.push({
            entityId: taskId,
            entityType: 'tasks',
            entitySubtype: 'task',
              allocation: { budget: budgetAlloc, premium: prizeAlloc }
          })
        }
      })
      
      budgetDistribution.tasks = taskAllocations
    }
    
    const res = await fetch('/api/v1/tasklists', {
      method: 'POST',
      body: JSON.stringify({
        create: !isEditing,
        taskListId: isEditing && initialList?.id ? initialList.id : undefined,
        role: roleJoined,
        name: form.name || undefined,
        budget: budgetValue,
        budgetPercentage: form.budgetPercentage,
        premiumPercentage: premiumPercentage > 0 ? premiumPercentage : undefined,
        budgetDistribution: Object.keys(budgetDistribution).length > 0 ? budgetDistribution : undefined,
        dueDate: form.dueDate || undefined,
        templateId: templateIdToLink,
        collaborators: form.collaborators.map(c => c.id),
        tasks,
      })
    })
    let newListId: string | undefined
    if (res.ok && !isEditing) {
      const data = await res.json()
      newListId = data.taskList?.id
    }
    await onCreated(newListId)
    onOpenChange(false)
  }

  const handleOpenChange = (newOpen: boolean) => {
    onOpenChange(newOpen)
    if (!newOpen) {
      // Reset form when closing
      setForm({
        name: '',
        templateId: '',
        budget: '',
        budgetPercentage: 0,
        dueDate: '',
        cadence: 'one-off',
        role: 'custom',
        collaborators: [],
      })
      setTasks([])
      setPremiumPercentage(0)
      setBudgetDistributionMode('equal')
      setAreaDistribution({})
      setCategoryDistribution({})
      setTaskBudgets({})
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-[768px] max-w-[90vw] max-h-[60vh] flex flex-col z-[9980]">
        <DialogHeader>
          <DialogTitle>{isEditing ? (t('forms.addListForm.titleEdit') || 'Edit List') : (t('forms.addListForm.titleCreate') || 'Create New List')}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto space-y-3 px-1">
        <div>
          <Label htmlFor="list-name">{t('forms.addListForm.nameLabel') || 'Name'}</Label>
          <Input id="list-name" value={form.name} onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))} />
        </div>
        {!isEditing && (
          <div>
            <Label htmlFor="template-or-list">{t('forms.addListForm.templateOrListLabel') || 'Template or List'}</Label>
            <Select value={form.templateId} onValueChange={(val) => setForm(prev => ({ ...prev, templateId: val }))}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t('forms.addListForm.chooseTemplatePlaceholder') || 'Choose a template'} />
              </SelectTrigger>
              <SelectContent>
                {userTemplates.map((tpl: any) => (
                  <SelectItem key={`tpl-${tpl.id}`} value={`template:${tpl.id}`} textValue={tpl.name || tpl.role || (t('forms.commonOptions.entities.template') || 'Template')}>
                    <div className="flex items-center gap-2">
                      <Package className="h-4 w-4 opacity-70" />
                      <span>{tpl.name || tpl.role || (t('forms.commonOptions.entities.template') || 'Template')}</span>
                    </div>
                  </SelectItem>
                ))}
                {allTaskLists.map((lst: any) => (
                  <SelectItem key={`lst-${lst.id}`} value={`list:${lst.id}`} textValue={lst.name || lst.role || (t('forms.commonOptions.entities.list') || 'List')}>
                    <div className="flex items-center gap-2">
                      <ListIcon className="h-4 w-4 opacity-70" />
                      <span>{lst.name || lst.role || (t('forms.commonOptions.entities.list') || 'List')}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label htmlFor="budget">{t('forms.addListForm.budgetLabel') || 'Budget'}</Label>
            <Input 
              id="budget"
              type="text" 
              inputMode="decimal"
              pattern="[0-9]*\.?[0-9]*"
              value={form.budget} 
              onChange={(e) => {
                const value = e.target.value
                // Allow empty string, numbers, and decimal points
                if (value === '' || /^\d*\.?\d*$/.test(value)) {
                  setForm(prev => ({ ...prev, budget: value }))
                }
              }} 
            />
          </div>
          <div>
            <Label htmlFor="due-date">{t('forms.addListForm.dueDateLabel') || 'Due date'}</Label>
            <Popover open={dateOpen} onOpenChange={setDateOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start text-left font-normal">
                  {dueDateObj ? dueDateObj.toISOString().slice(0,10) : <span>{t('forms.addListForm.pickDatePlaceholder') || 'Pick a date'}</span>}
                  <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="p-0">
                <Calendar
                  mode="single"
                  selected={dueDateObj}
                  onSelect={(date) => { setDueDateObj(date || undefined); setForm(prev => ({ ...prev, dueDate: date ? date.toISOString().slice(0,10) : '' })); setDateOpen(false) }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>
        <div>
          <Label htmlFor="cadence">{t('forms.addListForm.cadenceLabel') || 'Cadence'}</Label>
          <Select value={form.cadence} onValueChange={(val) => setForm(prev => ({ ...prev, cadence: val }))}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="one-off">{t('forms.addListForm.cadence.oneOff') || 'One-off'}</SelectItem>
              <SelectItem value="daily">{t('forms.addListForm.cadence.daily') || 'Daily'}</SelectItem>
              <SelectItem value="weekly">{t('forms.addListForm.cadence.weekly') || 'Weekly'}</SelectItem>
              <SelectItem value="monthly">{t('forms.addListForm.cadence.monthly') || 'Monthly'}</SelectItem>
              <SelectItem value="quarterly">{t('forms.addListForm.cadence.quarterly') || 'Quarterly'}</SelectItem>
              <SelectItem value="semester">{t('forms.addListForm.cadence.semester') || 'Semester'}</SelectItem>
              <SelectItem value="yearly">{t('forms.addListForm.cadence.yearly') || 'Yearly'}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="collaborators">{t('forms.addListForm.collaboratorsLabel') || 'Collaborators'}</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full justify-between">
                <span>{form.collaborators.length > 0 ? (t('forms.addListForm.selectedCount', { count: form.collaborators.length }) || `${form.collaborators.length} selected`) : (t('forms.addListForm.searchUsernames') || 'Search usernames...')}</span>
                <ChevronDown className="h-4 w-4 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[320px] p-0">
              <Command shouldFilter={false}>
                <CommandInput placeholder={t('forms.addListForm.typeAUsername') || 'Type a username...'} value={collabQuery} onValueChange={setCollabQuery} />
                <CommandList>
                  <CommandEmpty>{t('forms.addListForm.noResults') || 'No results.'}</CommandEmpty>
                  <CommandGroup>
                    {collabResults.map((p: any) => (
                      <CommandItem key={p.userId} value={p.userId} onSelect={() => {
                        if (!form.collaborators.find(c => c.id === p.userId)) {
                          setForm(prev => ({ ...prev, collaborators: [...prev.collaborators, { id: p.userId, userName: p.userName || p.userId }] }))
                        }
                      }}>
                        @{p.userName || p.userId}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          {form.collaborators.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {form.collaborators.map((c) => (
                <Badge key={c.id} variant="secondary" className="flex items-center gap-1">
                  @{c.userName}
                  <Button variant="ghost" size="sm" className="h-4 w-4 p-0 hover:bg-transparent" onClick={() => setForm(prev => ({ ...prev, collaborators: prev.collaborators.filter(x => x.id !== c.id) }))}>
                    ×
                  </Button>
                </Badge>
              ))}
            </div>
          )}
        </div>
        <div>
          <Label htmlFor="role">{t('forms.addListForm.roleLabel') || 'Role'}</Label>
          <Select value={form.role} onValueChange={(val) => setForm(prev => ({ ...prev, role: val }))}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="custom">{t('forms.addListForm.role.custom') || 'Custom'}</SelectItem>
              <SelectItem value="default">{t('forms.addListForm.role.default') || 'Default'}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="tasks" className="border-none">
            <AccordionTrigger className="py-2 px-0 hover:no-underline">
              <span className="text-sm font-medium">{t('forms.addListForm.manageTasks') || 'Manage Tasks'}</span>
            </AccordionTrigger>
            <AccordionContent className="pt-2 pb-0">
              <div>
                <Button variant="default" onClick={() => setAddTaskOpen(true)}>{t('forms.addListForm.addTaskButton') || 'Add task'}</Button>
                
                <Dialog open={addTaskOpen} onOpenChange={setAddTaskOpen}>
                  <DialogContent className="w-[480px] max-w-[90vw] max-h-[60vh] overflow-y-auto z-[9980]">
                    <DialogHeader>
                      <DialogTitle>{t('forms.addListForm.addTaskTitle') || 'Add Task'}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="task-name">{t('forms.addListForm.table.name') || 'Name'}</Label>
                        <Input id="task-name" value={addTaskForm.name} onChange={(e) => setAddTaskForm(prev => ({ ...prev, name: e.target.value }))} />
                      </div>
                      <div>
                        <Label htmlFor="task-area">{t('forms.addListForm.table.area') || 'Area'}</Label>
                        <Select value={addTaskForm.area} onValueChange={(val) => setAddTaskForm(prev => ({ ...prev, area: val }))}>
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="self">{t('forms.commonOptions.area.self') || 'Self'}</SelectItem>
                            <SelectItem value="home">{t('forms.commonOptions.area.home') || 'Home'}</SelectItem>
                            <SelectItem value="social">{t('forms.commonOptions.area.social') || 'Social'}</SelectItem>
                            <SelectItem value="work">{t('forms.commonOptions.area.work') || 'Work'}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor="task-category">{t('forms.addListForm.table.categories') || 'Category'}</Label>
                        <Select value={addTaskForm.category} onValueChange={(val) => setAddTaskForm(prev => ({ ...prev, category: val }))}>
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="custom">{t('forms.commonOptions.category.custom') || 'Custom'}</SelectItem>
                            <SelectItem value="body">{t('forms.commonOptions.category.body') || 'Body'}</SelectItem>
                            <SelectItem value="mind">{t('forms.commonOptions.category.mind') || 'Mind'}</SelectItem>
                            <SelectItem value="spirit">{t('forms.commonOptions.category.spirit') || 'Spirit'}</SelectItem>
                            <SelectItem value="fun">{t('forms.commonOptions.category.fun') || 'Fun'}</SelectItem>
                            <SelectItem value="growth">{t('forms.commonOptions.category.growth') || 'Growth'}</SelectItem>
                            <SelectItem value="community">{t('forms.commonOptions.category.community') || 'Community'}</SelectItem>
                            <SelectItem value="affection">{t('forms.commonOptions.category.affection') || 'Affection'}</SelectItem>
                            <SelectItem value="clean">{t('forms.commonOptions.category.clean') || 'Clean'}</SelectItem>
                            <SelectItem value="maintenance">{t('forms.commonOptions.category.maintenance') || 'Maintenance'}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor="task-times">{t('forms.addListForm.table.times') || '# of times'}</Label>
                        <Input id="task-times" type="number" min={1} value={addTaskForm.times} onChange={(e) => setAddTaskForm(prev => ({ ...prev, times: Math.max(1, Number(e.target.value) || 1) }))} />
                      </div>
                      <div className="flex justify-end gap-2 pt-2">
                        <Button variant="outline" onClick={() => setAddTaskOpen(false)}>{t('forms.addTemplateForm.task.cancel') || 'Cancel'}</Button>
                        <Button onClick={() => {
                          const name = addTaskForm.name.trim()
                          if (!name) return
                          const newTask = { name, area: addTaskForm.area as any, categories: [addTaskForm.category], status: 'Not started', cadence: form.cadence, times: addTaskForm.times, count: 0 }
                          setTasks(prev => [newTask, ...(prev || [])])
                          setAddTaskForm({ name: '', area: 'self', category: 'custom', times: 1 })
                          setAddTaskOpen(false)
                        }}>{t('forms.addTemplateForm.task.add') || 'Add'}</Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
                <div className="border rounded-md overflow-x-auto mt-2">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/50 text-left">
                        <th className="p-2">{t('forms.addListForm.table.name') || 'Name'}</th>
                        <th className="p-2">{t('forms.addListForm.table.times') || 'Times'}</th>
                        <th className="p-2">{t('forms.addListForm.table.area') || 'Area'}</th>
                        <th className="p-2">{t('forms.addListForm.table.categories') || 'Categories'}</th>
                        <th className="p-2 w-12 text-right"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {(tasks || []).map((task: any, idx: number) => (
                        <tr key={`${task.name}-${idx}`}>
                          <td className="p-2">{task.name}</td>
                          <td className="p-2">{task.times}</td>
                          <td className="p-2 capitalize">{task.area}</td>
                          <td className="p-2">{Array.isArray(task.categories) ? task.categories.join(', ') : ''}</td>
                          <td className="p-2 text-right">
                            <div className="inline-flex">
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setTasks(prev => (prev || []).map((t: any, i: number) => i === idx ? { ...t, times: (t.times || 1) + 1 } : t))}>⋯</Button>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive" onClick={() => setTasks(prev => (prev || []).filter((_: any, i: number) => i !== idx))}>×</Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="budget" className="border-none">
            <AccordionTrigger className="py-2 px-0 hover:no-underline">
              <span className="text-sm font-medium">{t('forms.addListForm.manageBudgetAllocation') || 'Manage Budget Allocation'}</span>
            </AccordionTrigger>
            <AccordionContent className="pt-2 pb-0">
              <div className="space-y-4">
                {/* Personal Budget Allocation with BudgetDistributionInput */}
                <BudgetDistributionInput
                  items={['personal']}
                  totalBudget={userEquity}
                  allocations={{
                    personal: {
                      percent: form.budgetPercentage,
                      nominal: (form.budgetPercentage / 100) * userEquity
                    }
                  }}
                  onChange={(allocs, metadata) => {
                    const alloc = allocs.personal
                    if (!alloc) return
                    const percentage = alloc.percent ?? nominalToPercent(alloc.nominal ?? 0, userEquity)
                    setForm(prev => ({ ...prev, budgetPercentage: Math.max(0, Math.min(maxAllowedBudget, percentage)) }))
                  }}
                  onModeChange={setBudgetPercentageMode}
                  mode={budgetPercentageMode}
                  label={t('forms.addListForm.budgetPercentageLabel') || 'Personal Budget Allocation (% of equity)'}
                />

                {/* Budget Distribution Mode */}
                <div>
                  <Label htmlFor="distribution-mode">{t('forms.addListForm.distributionModeLabel') || 'Distribution Mode'}</Label>
                  <Select value={budgetDistributionMode} onValueChange={(val: any) => setBudgetDistributionMode(val)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="equal">{t('forms.addListForm.distributionMode.equal') || 'Equal (split evenly)'}</SelectItem>
                      <SelectItem value="area">{t('forms.addListForm.distributionMode.area') || 'By Area'}</SelectItem>
                      <SelectItem value="category">{t('forms.addListForm.distributionMode.category') || 'By Category'}</SelectItem>
                      <SelectItem value="task">{t('forms.addListForm.distributionMode.task') || 'Per Task'}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Area Distribution */}
                {budgetDistributionMode === 'area' && (() => {
                  const taskAreas = tasks.length > 0 
                    ? Array.from(new Set(tasks.map(t => t.area).filter(Boolean)))
                    : ['self', 'home', 'social', 'work']
                  
                  return (
                    <div className="space-y-4">
                      <BudgetDistributionInput
                        items={taskAreas}
                        totalBudget={parseFloat(form.budget)}
                        allocations={areaDistribution}
                        onChange={(allocs) => setAreaDistribution(allocs)}
                        onModeChange={setAreaDistributionMode}
                        mode={areaDistributionMode}
                        label={t('forms.addListForm.areaDistributionLabel') || 'Area Budget Distribution (Earnings)'}
                        disabled={isBudgetDisabled}
                      />
                      <BudgetDistributionInput
                        items={taskAreas}
                        totalBudget={calculatePrizePool(form.budgetPercentage, userEquity)}
                        allocations={areaPremiumDistribution}
                        onChange={(allocs) => setAreaPremiumDistribution(allocs)}
                        onModeChange={setAreaPremiumDistributionMode}
                        mode={areaPremiumDistributionMode}
                        label={t('forms.addListForm.areaPremiumDistributionLabel') || 'Area Premium Distribution'}
                        disabled={isPremiumDisabled}
                      />
                    </div>
                  )
                })()}

                {/* Category Distribution */}
                {budgetDistributionMode === 'category' && (() => {
                  const allCategories = tasks.length > 0
                    ? Array.from(new Set(tasks.flatMap(t => t.categories || []).filter(Boolean)))
                    : ['custom', 'body', 'mind', 'spirit', 'fun', 'growth', 'community', 'affection', 'clean', 'maintenance']
                  
                  return (
                    <div className="space-y-4">
                      <BudgetDistributionInput
                        items={allCategories}
                        totalBudget={parseFloat(form.budget)}
                        allocations={categoryDistribution}
                        onChange={(allocs) => setCategoryDistribution(allocs)}
                        onModeChange={setCategoryDistributionMode}
                        mode={categoryDistributionMode}
                        label={t('forms.addListForm.categoryDistributionLabel') || 'Category Budget Distribution (Earnings)'}
                        disabled={isBudgetDisabled}
                      />
                      <BudgetDistributionInput
                        items={allCategories}
                        totalBudget={calculatePrizePool(form.budgetPercentage, userEquity)}
                        allocations={categoryPremiumDistribution}
                        onChange={(allocs) => setCategoryPremiumDistribution(allocs)}
                        onModeChange={setCategoryPremiumDistributionMode}
                        mode={categoryPremiumDistributionMode}
                        label={t('forms.addListForm.categoryPremiumDistributionLabel') || 'Category Premium Distribution'}
                        disabled={isPremiumDisabled}
                      />
                    </div>
                  )
                    })()}

                    {/* Per-Task Distribution */}
                    {budgetDistributionMode === 'task' && tasks.length > 0 && (() => {
                      const listBudget = parseFloat(form.budget) || 0
                      const premiumPool = calculatePrizePool(form.budgetPercentage, userEquity)
                      
                      const totalBudget = tasks.reduce((sum, task) => {
                        const taskId = task.id || task.name
                        const budgetAlloc = taskBudgets[taskId]?.budget
                        const prizeAlloc = taskBudgets[taskId]?.premium
                        // Use nominal values, falling back to percent calculation
                        const budgetNominal = getAllocationNominal(budgetAlloc, listBudget)
                        const prizeNominal = getAllocationNominal(prizeAlloc, premiumPool)
                        return sum + budgetNominal + prizeNominal
                      }, 0)
                      const remainingBudget = listBudget + premiumPool - totalBudget
                      
                      return (
                        <div className="space-y-3">
                          <div className="text-sm font-medium">
                            {t('forms.addListForm.taskDistributionLabel') || 'Per-Task Budget & Prize'}
                            <span className="ml-2 text-xs text-muted-foreground">
                              (Remaining: ${remainingBudget.toFixed(2)})
                            </span>
                          </div>
                          <div className="border rounded-md overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="bg-muted/50 text-left">
                                  <th className="p-2">{t('forms.addListForm.table.name') || 'Name'}</th>
                                  <th className="p-2">{t('forms.addListForm.budgetLabel') || 'Budget'}</th>
                                    <th className="p-2">{t('forms.addListForm.premiumLabel') || 'Premium'}</th>
                                  <th className="p-2">{t('forms.addListForm.totalLabel') || 'Total'}</th>
                                </tr>
                              </thead>
                              <tbody>
                                {tasks.map((task: any, idx: number) => {
                                  const taskId = task.id || task.name
                                  const budgetAlloc = taskBudgets[taskId]?.budget || {}
                                  const premiumAlloc = taskBudgets[taskId]?.premium || {}
                                  
                                  // Calculate nominal values for total calculation
                                  const budgetNominal = getAllocationNominal(budgetAlloc, listBudget)
                                  const premiumNominal = getAllocationNominal(premiumAlloc, premiumPool)
                                  const total = budgetNominal + premiumNominal
                                  
                                  return (
                                    <tr key={`${taskId}-${idx}`}>
                                      <td className="p-2">{task.name}</td>
                                      <td className="p-2">
                                        <BudgetDistributionInput
                                          items={[`budget-${taskId}`]}
                                          totalBudget={listBudget}
                                          allocations={{ [`budget-${taskId}`]: budgetAlloc }}
                                          onChange={(allocs, metadata) => {
                                            const alloc = allocs[`budget-${taskId}`] || {
                                              nominal: metadata?.nominalValues?.[`budget-${taskId}`] ?? 0,
                                              percent: metadata?.percentages?.[`budget-${taskId}`] ?? 0
                                            }
                                            
                                            setTaskBudgets(prev => ({
                                              ...prev,
                                              [taskId]: { 
                                                budget: alloc,
                                                premium: prev[taskId]?.premium || {}
                                              }
                                            }))
                                          }}
                                          label=""
                                          variant="horizontal"
                                          mode="currency"
                                          disabled={isBudgetDisabled}
                                        />
                                      </td>
                                      <td className="p-2">
                                        <BudgetDistributionInput
                                          items={[`premium-${taskId}`]}
                                          totalBudget={premiumPool}
                                          allocations={{ [`premium-${taskId}`]: premiumAlloc }}
                                          onChange={(allocs, metadata) => {
                                            const alloc = allocs[`premium-${taskId}`] || {
                                              nominal: metadata?.nominalValues?.[`premium-${taskId}`] ?? 0,
                                              percent: metadata?.percentages?.[`premium-${taskId}`] ?? 0
                                            }
                                            
                                            setTaskBudgets(prev => ({
                                              ...prev,
                                              [taskId]: { 
                                                budget: prev[taskId]?.budget || {},
                                                premium: alloc
                                              }
                                            }))
                                          }}
                                          label=""
                                          variant="horizontal"
                                          mode="currency"
                                          disabled={isPremiumDisabled}
                                        />
                                      </td>
                                      <td className="p-2 text-xs">${total.toFixed(2)}</td>
                                    </tr>
                                  )
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )
                    })()}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        <div className="flex gap-2">
          <Button size="sm" onClick={handleSubmit} disabled={!form.name.trim()}>{isEditing ? (t('forms.addListForm.save') || 'Save') : (t('forms.addListForm.create') || 'Create')}</Button>
          <Button size="sm" variant="outline" onClick={() => handleOpenChange(false)}>{t('forms.addListForm.cancel') || 'Cancel'}</Button>
          {isEditing && (
            <Button
              size="sm"
              variant="destructive"
              className="ml-auto"
              onClick={async () => {
                if (!initialList?.id) return
                const confirmed = window.confirm(t('forms.addListForm.deleteListConfirm') || 'Delete this list? This cannot be undone.')
                if (!confirmed) return
                await fetch('/api/v1/tasklists', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ deleteTaskList: true, taskListId: initialList.id })
                })
                await onCreated()
                onOpenChange(false)
              }}
            >
              {t('forms.addListForm.deleteList') || 'Delete list'}
            </Button>
          )}
        </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

