'use client'

import React from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { User as UserIcon } from 'lucide-react'
import { OptionsButton, OptionsMenuItem } from '@/components/optionsButton'

type TaskStatus = 'in progress' | 'steady' | 'ready' | 'open' | 'done' | 'ignored'

interface TaskItemProps {
  task: any
  taskStatus: TaskStatus
  statusColor: string
  iconColor: string
  optionsMenuItems: OptionsMenuItem[]
  onClick: () => void
  revealRedacted: boolean
  showCompleterBadge?: boolean
  completerName?: string | null
  taskEarnings?: number
  hasCollaborators?: boolean
  className?: string
  variant?: 'default' | 'outline'
}

export const TaskItem = ({
  task,
  taskStatus,
  statusColor,
  iconColor,
  optionsMenuItems,
  onClick,
  revealRedacted,
  showCompleterBadge = false,
  completerName,
  taskEarnings = 0,
  hasCollaborators = false,
  className = '',
  variant = 'outline',
}: TaskItemProps) => {
  const key = task?.id || task?.localeKey || task?.name
  const isDone = taskStatus === 'done' || (task?.count || 0) >= (task?.times || 1)

  return (
    <div key={`task__item--${key}`} className={`flex flex-col h-full w-full ${className}`}>
      <Button
        variant={variant}
        className={`rounded-md leading-7 text-sm min-h-[40px] h-full w-full whitespace-normal break-words py-2 flex items-center gap-2 justify-start ${className}`}
        onClick={onClick}
        aria-label={(task?.redacted === true && !revealRedacted) ? 'Redacted task' : (task.displayName || task.name)}
      >
        <OptionsButton
          items={optionsMenuItems}
          statusColor={statusColor}
          iconColor={iconColor}
          iconFilled={taskStatus === "done"}
          align="start"
        />
        <span className="flex-1 text-left">
          {task.times > 1 ? `${task.count || 0}/${task.times} ` : ''}
          {(task?.redacted === true && !revealRedacted) ? '·····' : (task.displayName || task.name)}
        </span>
      </Button>
      {showCompleterBadge
        && isDone
        && hasCollaborators
        && completerName && (
          <div className="mt-1">
            <Badge variant="secondary" className="bg-muted text-muted-foreground border-muted">
              <UserIcon className="h-3 w-3 mr-1" />
              @{completerName}{taskEarnings > 0 ? `: $${taskEarnings.toFixed(2)}` : ''}
            </Badge>
          </div>
        )}
    </div>
  )
}

