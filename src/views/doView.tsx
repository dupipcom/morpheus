'use client'

import React, { useContext, useEffect, useRef, useState, useMemo } from 'react'

import { GlobalContext } from '@/lib/contexts'
import { AddTaskForm } from '@/views/forms/addTaskForm'
import { AddListForm } from '@/views/forms/addListForm'
import { AddTemplateForm } from '@/views/forms/addTemplateForm'
import { ListView } from './listView'

interface DoViewProps {
  selectedTaskListId?: string
  selectedDate?: Date
  onDateChange?: (date: Date | undefined) => void
  showAddTask?: boolean
  showAddList?: boolean
  showAddTemplate?: boolean
  isEditingList?: boolean
  onCloseAddTask?: () => void
  onCloseAddList?: () => void
  onCloseAddTemplate?: () => void
  onTaskCreated?: () => Promise<void> | void
  onListCreated?: (newListId?: string) => Promise<void> | void
  onTemplateCreated?: () => Promise<void> | void
}

export function DoView({
  selectedTaskListId,
  selectedDate,
  onDateChange,
  showAddTask,
  showAddList,
  showAddTemplate,
  isEditingList,
  onCloseAddTask,
  onCloseAddList,
  onCloseAddTemplate,
  onTaskCreated,
  onListCreated,
  onTemplateCreated,
}: DoViewProps): React.ReactElement {
  const { refreshTaskLists, taskLists: contextTaskLists, refreshTemplates, templates: contextTemplates } = useContext(GlobalContext)
  const [stableTaskLists, setStableTaskLists] = useState<any[]>([])
  const [stableTemplates, setStableTemplates] = useState<any[]>([])
  const initialFetchDone = useRef(false)

  // Fetch immediately on mount
  useEffect(() => {
    if (!initialFetchDone.current) {
      initialFetchDone.current = true
      refreshTaskLists()
      refreshTemplates()
    }
  }, [refreshTaskLists, refreshTemplates])

  // Update stable state only when context has valid data (never clear once we have data)
  useEffect(() => {
    if (Array.isArray(contextTaskLists) && contextTaskLists.length > 0) {
      setStableTaskLists(contextTaskLists)
    }
  }, [contextTaskLists])

  useEffect(() => {
    if (Array.isArray(contextTemplates) && contextTemplates.length > 0) {
      setStableTemplates(contextTemplates)
    }
  }, [contextTemplates])

  // Refresh task lists every 30 seconds
  useEffect(() => {
    const intervalId = setInterval(() => {
      refreshTaskLists()
    }, 30000)
    return () => clearInterval(intervalId)
  }, [refreshTaskLists])

  const allTaskLists = useMemo(
    () => (stableTaskLists.length > 0 ? stableTaskLists : (Array.isArray(contextTaskLists) ? contextTaskLists : [])) as any[],
    [stableTaskLists, contextTaskLists]
  )

  const allTemplates = useMemo(
    () => (stableTemplates.length > 0 ? stableTemplates : (Array.isArray(contextTemplates) ? contextTemplates : [])) as any[],
    [stableTemplates, contextTemplates]
  )

  const selectedList = useMemo(
    () => allTaskLists.find((l: any) => l.id === selectedTaskListId),
    [allTaskLists, selectedTaskListId]
  )

  return (
    <>
      {showAddTask && (
        <div className="mb-4">
          <AddTaskForm
            selectedTaskListId={selectedTaskListId}
            onCancel={onCloseAddTask || (() => {})}
            onCreated={async () => {
              if (onTaskCreated) await onTaskCreated()
              if (onCloseAddTask) onCloseAddTask()
            }}
          />
        </div>
      )}

      {showAddList && (
        <div className="mb-4">
          <AddListForm
            allTaskLists={allTaskLists}
            userTemplates={allTemplates}
            isEditing={isEditingList || false}
            initialList={isEditingList ? (selectedList as any) : undefined}
            onCancel={onCloseAddList || (() => {})}
            onCreated={async (newListId) => {
              if (onListCreated) await onListCreated(newListId)
              if (onCloseAddList) onCloseAddList()
            }}
          />
        </div>
      )}

      {showAddTemplate && (
        <div className="mb-4">
          <AddTemplateForm
            allTaskLists={allTaskLists}
            onCancel={onCloseAddTemplate || (() => {})}
            onCreated={async () => {
              await refreshTemplates()
              if (onTemplateCreated) await onTemplateCreated()
              if (onCloseAddTemplate) onCloseAddTemplate()
            }}
          />
        </div>
      )}

      <ListView
        selectedTaskListId={selectedTaskListId}
        selectedDate={selectedDate}
        onDateChange={onDateChange}
      />
    </>
  )
}
