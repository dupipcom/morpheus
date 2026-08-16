'use client'

import { useMemo } from 'react'
import type { ReactNode } from 'react'
import useSWR from 'swr'
import { useRouter } from 'next/navigation'
import { LinkPreview } from '@/components/linkPreview'
import { NoteAttachments, type NoteDocumentRef } from '@/components/noteAttachments'
import { createUrlRegex, extractUrls } from '@/lib/utils/linkPreview'
import { jsonFetcher } from '@/lib/utils/utils'
import { useI18n } from '@/lib/contexts/i18n'

interface NoteContentProps {
  content: string
  truncate?: boolean
  maxLength?: number
  /** Optional slot rendered between text and link previews (e.g. expand button) */
  children?: ReactNode
  /** Tagged task ids; chips render only for tasks resolvable from the viewer's own lists */
  taskIds?: string[] | null
  /** Attached documents (metadata from the notes API); renders images/videos/audio inline */
  documents?: NoteDocumentRef[] | null
}

/**
 * Render text segments, turning each URL into a styled <a> tag.
 */
function renderTextWithLinks(text: string) {
  const urlRegex = createUrlRegex()
  const parts: ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = urlRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }
    const href = match[0]
    parts.push(
      <a
        key={`${href}-${match.index}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary underline break-all"
        onClick={(e) => e.stopPropagation()}
      >
        {href}
      </a>
    )
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }

  return parts
}

const MAX_TASK_LISTS = 5

interface TaskListResult {
  id: string
  name?: string | null
}

interface TasksResponse {
  tasks?: Array<{ id: string; name?: string | null }>
}

function getTodayDate(): string {
  const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  return new Date().toLocaleString('en-uk', { timeZone: userTimezone }).split(',')[0].split('/').reverse().join('-')
}

/**
 * Client-side resolution of tagged task ids: the viewer can only resolve tasks
 * that come from their own lists (fetched via SWR, deduped across cards).
 * Task ids that cannot be resolved locally (e.g. another user's private-list
 * tasks) are hidden. Server-side filtering (resolveNoteTags in
 * visibilityService) is ready for Phase 5, when the notes API pre-filters
 * taskIds before they leave the server.
 */
function useResolvableTaskLabels(taskIds: string[] | null | undefined): Array<{ id: string; name: string }> {
  const enabled = !!taskIds?.length

  const { data: listsData } = useSWR<{ taskLists?: TaskListResult[] }>(
    enabled ? '/api/v1/tasklists' : null,
    jsonFetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      shouldRetryOnError: false,
      dedupingInterval: 60000
    }
  )

  const listIds = useMemo(
    () => (listsData?.taskLists || []).slice(0, MAX_TASK_LISTS).map((list) => list.id),
    [listsData]
  )

  const { data: tasksData } = useSWR<TasksResponse[]>(
    enabled && listIds.length > 0 ? `note-task-chips:${getTodayDate()}:${listIds.join(',')}` : null,
    async () => {
      const today = getTodayDate()
      const results = await Promise.all(
        listIds.map(async (id) => {
          try {
            return await jsonFetcher<TasksResponse>(`/api/v1/tasks?listId=${id}&date=${today}`)
          } catch {
            return { tasks: [] }
          }
        })
      )
      return results
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      shouldRetryOnError: false,
      dedupingInterval: 60000
    }
  )

  return useMemo(() => {
    const ids = taskIds || []
    if (ids.length === 0 || !tasksData) return []
    const nameById = new Map<string, string>()
    for (const res of tasksData) {
      for (const task of res.tasks || []) {
        if (task.id && task.name && !nameById.has(task.id)) nameById.set(task.id, task.name)
      }
    }
    return ids.filter((id) => nameById.has(id)).map((id) => ({ id, name: nameById.get(id) as string }))
  }, [taskIds, tasksData])
}

/**
 * Small badges for a note's tagged tasks, linking to the Do view. Only tasks
 * the viewer can resolve from their own lists render; others are hidden.
 */
export function NoteTaskChips({ taskIds }: { taskIds?: string[] | null }) {
  const { t, locale } = useI18n()
  const router = useRouter()
  const resolved = useResolvableTaskLabels(taskIds)

  if (resolved.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-1.5 mb-2">
      <span className="text-xs text-muted-foreground">{t('notes.taskTags') || 'Tagged tasks'}:</span>
      {resolved.map((task) => (
        <button
          key={task.id}
          type="button"
          onClick={() => router.push(`/${locale}/app/do`)}
          className="inline-flex items-center rounded-full bg-primary/10 border border-primary/20 px-2 py-0.5 text-xs text-primary hover:bg-primary/20"
        >
          {task.name}
        </button>
      ))}
    </div>
  )
}

export function NoteContent({ content, truncate = false, maxLength = 150, children, taskIds, documents }: NoteContentProps) {
  const displayContent = useMemo(() => {
    if (!truncate || content.length <= maxLength) return content
    return `${content.slice(0, maxLength)}...`
  }, [content, truncate, maxLength])

  // Always extract URLs from full content (not truncated) and limit to 3,
  // so preview badges are visible regardless of fold/expand state.
  const urls = useMemo(() => extractUrls(content).slice(0, 3), [content])

  return (
    <div>
      <p className="text-sm whitespace-pre-wrap mb-1">
        {renderTextWithLinks(displayContent)}
      </p>
      {children}
      <NoteTaskChips taskIds={taskIds} />
      <NoteAttachments documents={documents} />
      {urls.map((url) => (
        <LinkPreview key={url} url={url} />
      ))}
    </div>
  )
}
