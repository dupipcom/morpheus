'use client'

import { useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'
import { jsonFetcher, cn } from '@/lib/utils/utils'
import { useI18n } from '@/lib/contexts/i18n'
import { Input } from '@/components/ui/input'
import { Loader2, Search, X } from 'lucide-react'

export interface EntityTag {
  id: string
  label: string
}

interface EntityTagPickerProps {
  kind: 'profile' | 'list' | 'task' | 'event'
  value: EntityTag[]
  onChange: (tags: EntityTag[]) => void
  /** Lists already attached to the note elsewhere (e.g. the reposted list) — excluded from selectable lists */
  currentNoteListIds?: string[]
}

const MAX_TAGS = 10
const MAX_RESULTS = 8
const MAX_TASK_LISTS = 5
const SEARCH_DEBOUNCE_MS = 300

interface ProfileResult {
  userId: string
  userName?: string | null
  firstName?: string | null
  lastName?: string | null
}

interface TaskListResult {
  id: string
  name?: string | null
}

interface TaskResult {
  id: string
  name?: string | null
}

interface EventResult {
  id: string
  name?: string | null
}

interface TasksResponse {
  tasks?: TaskResult[]
}

function getTodayDate(): string {
  const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  return new Date().toLocaleString('en-uk', { timeZone: userTimezone }).split(',')[0].split('/').reverse().join('-')
}

/**
 * Search picker for note tags: profiles (server-side debounced search), the
 * user's own lists and their tasks (fetched once, filtered locally). Selected
 * tags render as removable chips, capped at 10.
 */
export function EntityTagPicker({ kind, value, onChange, currentNoteListIds }: EntityTagPickerProps) {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [isFocused, setIsFocused] = useState(false)

  // Debounce the search input (profiles hit the server; lists/tasks filter locally)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query])

  const selectedIds = useMemo(() => new Set(value.map((tag) => tag.id)), [value])
  const canAddMore = value.length < MAX_TAGS

  // ---- profiles: server-side search driven by the debounced query ----
  const trimmedQuery = debouncedQuery.trim()
  const { data: profilesData, isLoading: profilesLoading } = useSWR<{ profiles?: ProfileResult[] }>(
    kind === 'profile' && trimmedQuery ? `/api/v1/profiles?query=${encodeURIComponent(trimmedQuery)}` : null,
    jsonFetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      shouldRetryOnError: false,
      dedupingInterval: 5000
    }
  )

  const profileResults = useMemo(() => {
    if (kind !== 'profile') return []
    return (profilesData?.profiles || [])
      .filter((profile) => !selectedIds.has(profile.userId))
      .map((profile) => ({
        id: profile.userId,
        label: profile.userName || profile.firstName || profile.lastName || profile.userId
      }))
      .slice(0, MAX_RESULTS)
  }, [kind, profilesData, selectedIds])

  // ---- lists: fetch the user's lists once, filter locally ----
  const { data: listsData, isLoading: listsLoading } = useSWR<{ taskLists?: TaskListResult[] }>(
    kind === 'list' || kind === 'task' ? '/api/v1/tasklists' : null,
    jsonFetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      shouldRetryOnError: false,
      dedupingInterval: 15000
    }
  )

  const allLists = useMemo(() => listsData?.taskLists || [], [listsData])

  const listResults = useMemo(() => {
    if (kind !== 'list') return []
    const q = query.trim().toLowerCase()
    return allLists
      .filter((list) => list.id && !selectedIds.has(list.id))
      .filter((list) => !currentNoteListIds?.includes(list.id))
      .filter((list) => !q || (list.name || '').toLowerCase().includes(q))
      .slice(0, MAX_RESULTS)
      .map((list) => ({ id: list.id, label: list.name || list.id }))
  }, [kind, allLists, query, selectedIds, currentNoteListIds])

  // ---- tasks: tasks of the user's own lists (cap 5 lists), merged + deduped ----
  const taskListIds = useMemo(() => allLists.slice(0, MAX_TASK_LISTS).map((list) => list.id), [allLists])

  const { data: tasksData, isLoading: tasksLoading } = useSWR<TasksResponse[]>(
    kind === 'task' && taskListIds.length > 0 ? `note-tag-tasks:${getTodayDate()}:${taskListIds.join(',')}` : null,
    async () => {
      const today = getTodayDate()
      const results = await Promise.all(
        taskListIds.map(async (id) => {
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
      dedupingInterval: 10000
    }
  )

  const taskResults = useMemo(() => {
    if (kind !== 'task') return []
    const q = query.trim().toLowerCase()
    const merged = new Map<string, TaskResult>()
    for (const res of tasksData || []) {
      for (const task of res.tasks || []) {
        if (task.id && !merged.has(task.id)) merged.set(task.id, task)
      }
    }
    return [...merged.values()]
      .filter((task) => !selectedIds.has(task.id))
      .filter((task) => !q || (task.name || '').toLowerCase().includes(q))
      .slice(0, MAX_RESULTS)
      .map((task) => ({ id: task.id, label: task.name || task.id }))
  }, [kind, tasksData, query, selectedIds])

  // ---- events: the user's own life events, fetched once and filtered locally ----
  const { data: eventsData, isLoading: eventsLoading } = useSWR<{ lifeEvents?: EventResult[] }>(
    kind === 'event' ? '/api/v1/events' : null,
    jsonFetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      shouldRetryOnError: false,
      dedupingInterval: 15000
    }
  )

  const eventResults = useMemo(() => {
    if (kind !== 'event') return []
    const q = query.trim().toLowerCase()
    return (eventsData?.lifeEvents || [])
      .filter((event) => event.id && !selectedIds.has(event.id))
      .filter((event) => !q || (event.name || '').toLowerCase().includes(q))
      .slice(0, MAX_RESULTS)
      .map((event) => ({ id: event.id, label: event.name || event.id }))
  }, [kind, eventsData, query, selectedIds])

  const results = kind === 'profile' ? profileResults : kind === 'list' ? listResults : kind === 'task' ? taskResults : eventResults
  const isLoading = kind === 'profile' ? profilesLoading : kind === 'list' ? listsLoading : kind === 'task' ? tasksLoading : eventsLoading
  // Profiles need a query (server-side search); lists/tasks/events show on focus and filter locally
  const showResults = kind === 'profile' ? isFocused && query.trim().length > 0 : isFocused

  const addTag = (tag: EntityTag) => {
    if (!canAddMore || selectedIds.has(tag.id)) return
    onChange([...value, tag])
  }

  const removeTag = (id: string) => {
    onChange(value.filter((tag) => tag.id !== id))
  }

  const searchPlaceholder = t('components.entityTagPicker.searchPlaceholder') || 'Search'
  const noResultsLabel = t('components.entityTagPicker.noResults') || 'No results found'
  const removeTagLabel = t('components.entityTagPicker.removeTag') || 'Remove tag'
  const maxTagsLabel = t('components.entityTagPicker.maxTagsReached') || 'Maximum of 10 tags'
  const searchingLabel = t('components.entityTagPicker.searching') || 'Searching…'

  return (
    <div className="w-full">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={searchPlaceholder}
          className="pl-8 h-9 text-sm"
          aria-label={searchPlaceholder}
        />
      </div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {value.map((tag) => (
            <span
              key={tag.id}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 border border-primary/20 px-2 py-0.5 text-xs text-primary max-w-full"
            >
              <span className="truncate">{tag.label}</span>
              <button
                type="button"
                onClick={() => removeTag(tag.id)}
                className="hover:text-foreground shrink-0"
                aria-label={`${removeTagLabel}: ${tag.label}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      {!canAddMore && (
        <p className="text-xs text-muted-foreground mt-1">{maxTagsLabel}</p>
      )}
      {showResults && (
        <div className="mt-2 border rounded-md border-body max-h-40 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              {searchingLabel}
            </div>
          ) : results.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">{noResultsLabel}</div>
          ) : (
            <ul>
              {results.map((result) => (
                <li key={result.id}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => addTag(result)}
                    disabled={!canAddMore}
                    className={cn(
                      'w-full text-left px-3 py-1.5 text-sm hover:bg-muted truncate',
                      !canAddMore && 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    {result.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
