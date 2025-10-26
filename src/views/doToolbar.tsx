'use client'

import React, { useContext, useMemo } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { GlobalContext } from '@/lib/contexts'
import { useI18n } from '@/lib/contexts/i18n'

type TaskList = { id: string; name?: string; role?: string }

export const DoToolbar = ({
  locale: _locale,
  selectedTaskListId,
  onChangeSelectedTaskListId,
  onAddEphemeral: _onAddEphemeral,
}: {
  locale: string
  selectedTaskListId?: string
  onChangeSelectedTaskListId: (id: string) => void
  onAddEphemeral: () => Promise<void> | void
}) => {
  const { t } = useI18n()
  const { taskLists } = useContext(GlobalContext)
  const allTaskLists = useMemo(() => (Array.isArray(taskLists) ? taskLists : []), [taskLists]) as TaskList[]

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Select value={selectedTaskListId} onValueChange={onChangeSelectedTaskListId}>
          <SelectTrigger className="w-[260px]">
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
      </div>
    </div>
  )
}


