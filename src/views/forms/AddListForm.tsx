'use client'

import React, { useMemo, useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { Badge } from '@/components/ui/badge'
import { Package, List as ListIcon, MoreHorizontal, ChevronDown, Calendar as CalendarIcon } from 'lucide-react'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'

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
  onCreated: () => Promise<void> | void
}) => {
  const [form, setForm] = useState({
    name: '',
    templateId: '',
    budget: '',
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

  useEffect(() => {
    if (initialList) {
      setForm({
        name: initialList.name || '',
        templateId: initialList.templateId ? `template:${initialList.templateId}` : '',
        budget: initialList.budget || '',
        dueDate: initialList.dueDate || '',
        cadence: initialList.cadence || 'one-off',
        role: initialList.role || 'custom',
        collaborators: (initialList.collaborators || []).map((id: string) => ({ id, userName: id }))
      })
      setTasks(Array.isArray(initialList.tasks) ? initialList.tasks : [])
      setDueDateObj(initialList.dueDate ? new Date(initialList.dueDate) : undefined)
    }
  }, [JSON.stringify(initialList)])

  const newListPreviewTasks = useMemo(() => {
    if (!form.templateId) return [] as any[]
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
    setTasks(newListPreviewTasks)
  }, [newListPreviewTasks])

  const [collabResults, setCollabResults] = useState<any[]>([])
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      if (!collabQuery) { setCollabResults([]); return }
      const res = await fetch(`/api/v1/profiles?query=${encodeURIComponent(collabQuery)}`)
      if (!cancelled && res.ok) {
        const data = await res.json()
        setCollabResults(data.profiles || [])
      }
    }
    run()
    return () => { cancelled = true }
  }, [collabQuery])

  const handleSubmit = async () => {
    const roleJoined = `${form.cadence}.${form.role}`
    let templateIdToLink: string | undefined
    if (form.templateId?.startsWith('template:')) templateIdToLink = form.templateId.split(':')[1]
    await fetch('/api/v1/tasklists', {
      method: 'POST',
      body: JSON.stringify({
        create: !isEditing,
        role: roleJoined,
        name: form.name || undefined,
        budget: form.budget || undefined,
        dueDate: form.dueDate || undefined,
        templateId: templateIdToLink,
        collaborators: form.collaborators.map(c => c.id),
        tasks,
      })
    })
    await onCreated()
    onCancel()
  }

  return (
    <Card className="mb-2 p-4">
      <CardHeader>
        <CardTitle className="text-sm">{isEditing ? 'Edit List' : 'Create New List'}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <label className="text-sm font-medium">Name</label>
          <input className="w-full p-2 border rounded-md" value={form.name} onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))} />
        </div>
        <div>
          <label className="text-sm font-medium">Template or List</label>
          <Select value={form.templateId} onValueChange={(val) => setForm(prev => ({ ...prev, templateId: val }))}>
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
            <input type="number" value={form.budget} onChange={(e) => setForm(prev => ({ ...prev, budget: e.target.value }))} className="w-full p-2 border rounded-md" />
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
                  onSelect={(date) => { setDueDateObj(date || undefined); setForm(prev => ({ ...prev, dueDate: date ? date.toISOString().slice(0,10) : '' })); setDateOpen(false) }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
          <div>
            <label className="text-sm font-medium">Cadence</label>
            <Select value={form.cadence} onValueChange={(val) => setForm(prev => ({ ...prev, cadence: val }))}>
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
                <span>{form.collaborators.length > 0 ? `${form.collaborators.length} selected` : 'Search usernames...'}</span>
                <ChevronDown className="h-4 w-4 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[320px] p-0">
              <Command shouldFilter={false}>
                <CommandInput placeholder="Type a username..." value={collabQuery} onValueChange={setCollabQuery} />
                <CommandList>
                  <CommandEmpty>No results.</CommandEmpty>
                  <CommandGroup>
                    {collabResults.map((p: any) => (
                      <CommandItem key={p.userId} value={p.userId} onSelect={() => {
                        if (!form.collaborators.find(c => c.id === p.userId)) {
                          setForm(prev => ({ ...prev, collaborators: [...prev.collaborators, { id: p.userId, userName: p.userName }] }))
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
          <label className="text-sm font-medium">Role</label>
          <Select value={form.role} onValueChange={(val) => setForm(prev => ({ ...prev, role: val }))}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="custom">Custom</SelectItem>
              <SelectItem value="default">Default</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
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
                    const newTask = { name, area: addTaskForm.area as any, categories: [addTaskForm.category], status: 'Not started', cadence: form.cadence, times: addTaskForm.times, count: 0 }
                    setTasks(prev => [newTask, ...(prev || [])])
                    setAddTaskForm({ name: '', area: 'self', category: 'custom', times: 1 })
                    setAddTaskOpen(false)
                  }}>Add</Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
          <div className="border rounded-md overflow-x-auto mt-2">
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
          <Button size="sm" onClick={handleSubmit} disabled={!form.name.trim()}>{isEditing ? 'Save' : 'Create'}</Button>
          <Button size="sm" variant="outline" onClick={onCancel}>Cancel</Button>
        </div>
      </CardContent>
    </Card>
  )
}


