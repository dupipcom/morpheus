'use client'

import React, { useMemo, useState, useEffect, useContext } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { Badge } from '@/components/ui/badge'
import { Slider } from '@/components/ui/slider'
import { Package, List as ListIcon, MoreHorizontal, ChevronDown, Calendar as CalendarIcon, Percent } from 'lucide-react'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { useI18n } from '@/lib/contexts/i18n'
import { GlobalContext } from '@/lib/contexts'

type Collaborator = { id: string, userName: string }

export const AddListForm = ({
  allTaskLists,
  userTemplates,
  isEditing,
  initialList,
  onCancel,
  onCreated,
}: {
  allTaskLists: any[]
  userTemplates: any[]
  isEditing: boolean
  initialList?: any
  onCancel: () => void
  onCreated: (newListId?: string) => Promise<void> | void
}) => {
  const { t } = useI18n()
  const { session } = useContext(GlobalContext)
  const [form, setForm] = useState({
    name: '',
    templateId: '',
    budget: '',
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
      // Load tasks from tasks (working copy) if available, otherwise from templateTasks
      const tasksToLoad = (Array.isArray(initialList.tasks) && initialList.tasks.length > 0)
        ? initialList.tasks
        : (Array.isArray(initialList.templateTasks) ? initialList.templateTasks : [])
      setTasks(tasksToLoad)
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

  const [collabResults, setCollabResults] = useState<any[]>([])
  useEffect(() => {
    let cancelled = false
    // Debounce the search by 300ms
    const timer = setTimeout(() => {
      const run = async () => {
        // Fetch suggestions even when query is empty (shows top 5 close friends/friends/public)
        const res = await fetch(`/api/v1/profiles?query=${encodeURIComponent(collabQuery)}`)
        if (!cancelled && res.ok) {
          const data = await res.json()
          setCollabResults(data.profiles || [])
        }
      }
      run()
    }, 300)
    
    return () => { 
      cancelled = true
      clearTimeout(timer)
    }
  }, [collabQuery])

  const handleSubmit = async () => {
    const roleJoined = `${form.cadence}.${form.role}`
    let templateIdToLink: string | undefined
    if (!isEditing && form.templateId?.startsWith('template:')) templateIdToLink = form.templateId.split(':')[1]
    // Parse budget as float, default to undefined if empty or invalid
    const budgetValue = form.budget && form.budget.trim() !== '' 
      ? parseFloat(form.budget) 
      : undefined
    
    const res = await fetch('/api/v1/tasklists', {
      method: 'POST',
      body: JSON.stringify({
        create: !isEditing,
        taskListId: isEditing && initialList?.id ? initialList.id : undefined,
        role: roleJoined,
        name: form.name || undefined,
        budget: budgetValue,
        budgetPercentage: form.budgetPercentage,
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
    onCancel()
  }

  return (
    <Card className="mb-2 p-4">
      <CardHeader>
        <CardTitle className="text-sm">{isEditing ? (t('forms.addListForm.titleEdit') || 'Edit List') : (t('forms.addListForm.titleCreate') || 'Create New List')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <label className="text-sm font-medium">{t('forms.addListForm.nameLabel') || 'Name'}</label>
          <input className="w-full p-2 border rounded-md" value={form.name} onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))} />
        </div>
        {!isEditing && (
          <div>
            <label className="text-sm font-medium">{t('forms.addListForm.templateOrListLabel') || 'Template or List'}</label>
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
            <label className="text-sm font-medium">{t('forms.addListForm.budgetLabel') || 'Budget'}</label>
            <input 
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
              className="w-full p-2 border rounded-md" 
            />
          </div>
          <div>
            <label className="text-sm font-medium">{t('forms.addListForm.dueDateLabel') || 'Due date'}</label>
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
        {isEditing && (
          <div>
            <label className="text-sm font-medium flex items-center gap-2">
              <Percent className="h-4 w-4" />
              {t('forms.addListForm.budgetPercentageLabel') || 'Budget Allocation'} ({form.budgetPercentage.toFixed(0)}%)
            </label>
            <div className="space-y-2 mt-2">
              <Slider
                value={[form.budgetPercentage]}
                onValueChange={(values) => setForm(prev => ({ ...prev, budgetPercentage: values[0] }))}
                min={0}
                max={maxAllowedBudget}
                step={1}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>0%</span>
                <span className="text-sm font-medium text-center flex-1">
                  {remainingBudget.toFixed(0)}% of budget remaining (max: {maxAllowedBudget.toFixed(0)}%)
                </span>
                <span>{maxAllowedBudget.toFixed(0)}%</span>
              </div>
            </div>
          </div>
        )}
        <div>
          <label className="text-sm font-medium">{t('forms.addListForm.cadenceLabel') || 'Cadence'}</label>
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
          <label className="text-sm font-medium">{t('forms.addListForm.collaboratorsLabel') || 'Collaborators'}</label>
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
          <label className="text-sm font-medium">{t('forms.addListForm.roleLabel') || 'Role'}</label>
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

        <div>
          <Popover open={addTaskOpen} onOpenChange={setAddTaskOpen}>
            <PopoverTrigger asChild>
              <Button variant="default">{t('forms.addListForm.addTaskButton') || 'Add task'}</Button>
            </PopoverTrigger>
            <PopoverContent className="w-[320px]">
              <div className="space-y-2">
                <div>
                  <label className="text-sm font-medium">{t('forms.addListForm.table.name') || 'Name'}</label>
                  <input className="w-full p-2 border rounded-md" value={addTaskForm.name} onChange={(e) => setAddTaskForm(prev => ({ ...prev, name: e.target.value }))} />
                </div>
                <div>
                  <label className="text-sm font-medium">{t('forms.addListForm.table.area') || 'Area'}</label>
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
                  <label className="text-sm font-medium">{t('forms.addListForm.table.categories') || 'Category'}</label>
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
                  <label className="text-sm font-medium">{t('forms.addListForm.table.times') || '# of times'}</label>
                  <input type="number" min={1} className="w-full p-2 border rounded-md" value={addTaskForm.times} onChange={(e) => setAddTaskForm(prev => ({ ...prev, times: Math.max(1, Number(e.target.value) || 1) }))} />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" size="sm" onClick={() => setAddTaskOpen(false)}>{t('forms.addTemplateForm.task.cancel') || 'Cancel'}</Button>
                  <Button size="sm" onClick={() => {
                    const name = addTaskForm.name.trim()
                    if (!name) return
                    const newTask = { name, area: addTaskForm.area as any, categories: [addTaskForm.category], status: 'Not started', cadence: form.cadence, times: addTaskForm.times, count: 0 }
                    setTasks(prev => [newTask, ...(prev || [])])
                    setAddTaskForm({ name: '', area: 'self', category: 'custom', times: 1 })
                    setAddTaskOpen(false)
                  }}>{t('forms.addTemplateForm.task.add') || 'Add'}</Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
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

        <div className="flex gap-2">
          <Button size="sm" onClick={handleSubmit} disabled={!form.name.trim()}>{isEditing ? (t('forms.addListForm.save') || 'Save') : (t('forms.addListForm.create') || 'Create')}</Button>
          <Button size="sm" variant="outline" onClick={onCancel}>{t('forms.addListForm.cancel') || 'Cancel'}</Button>
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
                onCancel()
              }}
            >
              {t('forms.addListForm.deleteList') || 'Delete list'}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}


