'use client'

import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'

export const AddTaskForm = ({
  selectedTaskListId,
  onCancel,
  onCreated
}: {
  selectedTaskListId?: string
  onCancel: () => void
  onCreated: () => Promise<void> | void
}) => {
  const [newTask, setNewTask] = useState({ name: '', area: 'self', category: 'custom', saveToTemplate: false })

  const handleSubmit = async () => {
    if (!selectedTaskListId || !newTask.name.trim()) return
    const listTask = {
      name: newTask.name.trim(),
      area: newTask.area,
      categories: [newTask.category],
      cadence: 'day',
      status: 'Not started',
      times: 1,
      count: 0,
      isEphemeral: !newTask.saveToTemplate,
      createdAt: new Date().toISOString()
    }
    await fetch('/api/v1/tasklists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskListId: selectedTaskListId, ephemeralTasks: { add: listTask } })
    })
    await onCreated()
    onCancel()
  }

  return (
    <Card className="mb-2 p-4">
      <CardHeader>
        <CardTitle className="text-sm">Add Custom Task</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <label className="text-sm font-medium">Task Name</label>
          <input
            type="text"
            value={newTask.name}
            onChange={(e) => setNewTask(prev => ({ ...prev, name: e.target.value }))}
            placeholder="Enter task name..."
            className="w-full p-2 border rounded-md"
          />
        </div>
        <div>
          <label className="text-sm font-medium">Area</label>
          <select
            value={newTask.area}
            onChange={(e) => setNewTask(prev => ({ ...prev, area: e.target.value }))}
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
            value={newTask.category}
            onChange={(e) => setNewTask(prev => ({ ...prev, category: e.target.value }))}
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
            checked={newTask.saveToTemplate}
            onCheckedChange={(checked) => setNewTask(prev => ({ ...prev, saveToTemplate: checked }))}
          />
          <label htmlFor="save-to-template" className="text-sm font-medium">
            Save task to template
          </label>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleSubmit} disabled={!newTask.name.trim()} size="sm">Add Task</Button>
          <Button variant="outline" onClick={onCancel} size="sm">Cancel</Button>
        </div>
      </CardContent>
    </Card>
  )
}


