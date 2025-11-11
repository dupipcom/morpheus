'use client'

import React, { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useI18n } from '@/lib/contexts/i18n'

export const AddTemplateForm = ({
  allTaskLists,
  onCancel,
  onCreated,
}: {
  allTaskLists: any[]
  onCancel: () => void
  onCreated: () => Promise<void> | void
}) => {
  const { t } = useI18n()
  const [form, setForm] = useState({ name: '', createFrom: '', visibility: 'PRIVATE', tasks: [] as any[] })
  const [addTaskOpen, setAddTaskOpen] = useState(false)
  const [addTaskForm, setAddTaskForm] = useState({ name: '', area: 'self', category: 'custom', times: 1 })

  const previewTasks = useMemo(() => {
    if (form.createFrom?.startsWith('list:')) {
      const lstId = form.createFrom.split(':')[1]
      const lst = allTaskLists.find((l: any) => l.id === lstId)
      return Array.isArray(lst?.tasks) ? lst.tasks : []
    }
    return [] as any[]
  }, [form.createFrom, allTaskLists])

  const aggregatedTasks = useMemo(() => {
    return [...form.tasks, ...previewTasks]
  }, [form.tasks, previewTasks])

  const handleSubmit = async () => {
    const tasks = form.tasks.length > 0 ? form.tasks : previewTasks
    if (!form.name.trim()) return
    await fetch('/api/v1/templates', {
      method: 'POST',
      body: JSON.stringify({ name: form.name.trim(), tasks, visibility: form.visibility })
    })
    await onCreated()
    onCancel()
  }

  return (
    <Card className="mb-2 p-4">
      <CardHeader>
        <CardTitle className="text-sm">{t('forms.addTemplateForm.title') || 'Create New Template'}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <label className="text-sm font-medium">{t('forms.addTemplateForm.nameLabel') || 'Name'}</label>
          <input className="w-full p-2 border rounded-md" value={form.name} onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-sm font-medium">{t('forms.addTemplateForm.createFromLabel') || 'Create from'}</label>
            <Select value={form.createFrom} onValueChange={(val) => setForm(prev => ({ ...prev, createFrom: val, tasks: [] }))}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t('forms.addTemplateForm.chooseListToClonePlaceholder') || 'Choose a list to clone (optional)'} />
              </SelectTrigger>
              <SelectContent>
                {allTaskLists.map((lst: any) => (
                  <SelectItem key={`from-${lst.id}`} value={`list:${lst.id}`} textValue={lst.name || lst.role || (t('forms.commonOptions.entities.list') || 'List')}>
                    <div className="flex items-center gap-2">
                      <span>{lst.name || lst.role || (t('forms.commonOptions.entities.list') || 'List')}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium">{t('forms.addTemplateForm.visibilityLabel') || 'Visibility'}</label>
            <Select value={form.visibility} onValueChange={(val) => setForm(prev => ({ ...prev, visibility: val }))}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PRIVATE">{t('forms.addTemplateForm.visibility.private') || 'Private'}</SelectItem>
                <SelectItem value="PUBLIC">{t('forms.addTemplateForm.visibility.public') || 'Public'}</SelectItem>
                <SelectItem value="FRIENDS">{t('forms.addTemplateForm.visibility.friends') || 'Friends'}</SelectItem>
                <SelectItem value="CLOSE_FRIENDS">{t('forms.addTemplateForm.visibility.closeFriends') || 'Close friends'}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex justify-end mb-2">
          <Button variant="default" onClick={() => setAddTaskOpen(true)}>{t('forms.addTemplateForm.addTaskButton') || 'Add task'}</Button>
        </div>
        {addTaskOpen && (
          <div className="w-[320px] border rounded-md p-3">
            <div className="space-y-2">
              <div>
                <label className="text-sm font-medium">{t('forms.addTemplateForm.task.nameLabel') || 'Name'}</label>
                <input className="w-full p-2 border rounded-md" value={addTaskForm.name} onChange={(e) => setAddTaskForm(prev => ({ ...prev, name: e.target.value }))} />
              </div>
              <div>
                <label className="text-sm font-medium">{t('forms.addTemplateForm.task.areaLabel') || 'Area'}</label>
                <select className="w-full p-2 border rounded-md" value={addTaskForm.area} onChange={(e) => setAddTaskForm(prev => ({ ...prev, area: e.target.value }))}>
                  <option value="self">{t('forms.commonOptions.area.self') || 'Self'}</option>
                  <option value="home">{t('forms.commonOptions.area.home') || 'Home'}</option>
                  <option value="social">{t('forms.commonOptions.area.social') || 'Social'}</option>
                  <option value="work">{t('forms.commonOptions.area.work') || 'Work'}</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">{t('forms.addTemplateForm.task.categoryLabel') || 'Category'}</label>
                <select className="w-full p-2 border rounded-md" value={addTaskForm.category} onChange={(e) => setAddTaskForm(prev => ({ ...prev, category: e.target.value }))}>
                  <option value="custom">{t('forms.commonOptions.category.custom') || 'Custom'}</option>
                  <option value="body">{t('forms.commonOptions.category.body') || 'Body'}</option>
                  <option value="mind">{t('forms.commonOptions.category.mind') || 'Mind'}</option>
                  <option value="spirit">{t('forms.commonOptions.category.spirit') || 'Spirit'}</option>
                  <option value="fun">{t('forms.commonOptions.category.fun') || 'Fun'}</option>
                  <option value="growth">{t('forms.commonOptions.category.growth') || 'Growth'}</option>
                  <option value="community">{t('forms.commonOptions.category.community') || 'Community'}</option>
                  <option value="affection">{t('forms.commonOptions.category.affection') || 'Affection'}</option>
                  <option value="clean">{t('forms.commonOptions.category.clean') || 'Clean'}</option>
                  <option value="maintenance">{t('forms.commonOptions.category.maintenance') || 'Maintenance'}</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">{t('forms.addTemplateForm.task.timesLabel') || '# of times'}</label>
                <input type="number" min={1} className="w-full p-2 border rounded-md" value={addTaskForm.times} onChange={(e) => setAddTaskForm(prev => ({ ...prev, times: Math.max(1, Number(e.target.value) || 1) }))} />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => setAddTaskOpen(false)}>{t('forms.addTemplateForm.task.cancel') || 'Cancel'}</Button>
                <Button size="sm" onClick={() => {
                  const name = addTaskForm.name.trim()
                  if (!name) return
                  const newTask = { name, area: addTaskForm.area as any, categories: [addTaskForm.category], status: 'open', cadence: 'daily', times: addTaskForm.times, count: 0 }
                  setForm(prev => ({ ...prev, tasks: [...prev.tasks, newTask] }))
                  setAddTaskForm({ name: '', area: 'self', category: 'custom', times: 1 })
                  setAddTaskOpen(false)
                }}>{t('forms.addTemplateForm.task.add') || 'Add'}</Button>
              </div>
            </div>
          </div>
        )}

        <div className="border rounded-md overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 text-left">
                <th className="p-2">{t('forms.addTemplateForm.table.name') || 'Name'}</th>
                <th className="p-2">{t('forms.addTemplateForm.table.times') || 'Times'}</th>
                <th className="p-2">{t('forms.addTemplateForm.table.area') || 'Area'}</th>
                <th className="p-2">{t('forms.addTemplateForm.table.categories') || 'Categories'}</th>
                <th className="p-2 w-12 text-right"></th>
              </tr>
            </thead>
            <tbody>
              {aggregatedTasks.map((task: any, idx: number) => (
                <tr key={`${task.name}-${idx}`}>
                  <td className="p-2">{task.name}</td>
                  <td className="p-2">{task.times}</td>
                  <td className="p-2 capitalize">{task.area}</td>
                  <td className="p-2">{Array.isArray(task.categories) ? task.categories.join(', ') : ''}</td>
                  <td className="p-2 text-right">
                    <div className="inline-flex">
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => {
                        const updated = aggregatedTasks.map((t: any, i: number) => i === idx ? { ...t, times: (t.times || 1) + 1 } : t)
                        setForm(prev => ({ ...prev, tasks: updated }))
                      }}>⋯</Button>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive" onClick={() => {
                        const updated = aggregatedTasks.filter((_: any, i: number) => i !== idx)
                        setForm(prev => ({ ...prev, tasks: updated }))
                      }}>×</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={handleSubmit} disabled={!form.name.trim()}>{t('forms.addTemplateForm.create') || 'Create'}</Button>
          <Button size="sm" variant="outline" onClick={onCancel}>{t('forms.addTemplateForm.cancel') || 'Cancel'}</Button>
        </div>
      </CardContent>
    </Card>
  )
}


