'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import useSWR from 'swr'
import { useI18n } from '@/lib/contexts/i18n'
import { jsonFetcher } from '@/lib/utils/utils'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AddProjectForm } from '@/views/forms/addProjectForm'

interface PublicListCard {
  id: string
  name?: string | null
  publicTagline?: string | null
  bio?: string | null
  publicUrl?: string | null
  area?: string | null
  categories?: string[]
  likeCount?: number
  ownerProfile?: { userName?: string | null }
  project?: { username: string }
}

interface ProjectCard {
  id: string
  name: string
  username: string
}

/**
 * Job board discovery: public lists across the platform, filtered locally
 * (SWR fetch once + local filters per the frontend rules), plus the viewer's
 * projects with create/edit.
 */
export default function JobsPage() {
  const { locale } = useParams<{ locale: string }>()
  const { t } = useI18n()

  const [q, setQ] = useState('')
  const [area, setArea] = useState('')
  const [category, setCategory] = useState('')
  const [showAddProject, setShowAddProject] = useState(false)

  const { data } = useSWR<{ taskLists: PublicListCard[] }>(
    '/api/v1/tasklists/public?limit=50',
    jsonFetcher,
    { revalidateOnFocus: false, dedupingInterval: 10000 }
  )
  const { data: projectsData, mutate: mutateProjects } = useSWR<{ projects: ProjectCard[] }>(
    '/api/v1/projects',
    jsonFetcher,
    { revalidateOnFocus: false }
  )

  const taskLists = useMemo(() => data?.taskLists || [], [data])
  const projects = useMemo(() => projectsData?.projects || [], [projectsData])

  const filtered = useMemo(() => {
    const normalizedQuery = q.trim().toLowerCase()
    return taskLists.filter((list) => {
      if (area && list.area !== area) return false
      if (category && !(list.categories || []).includes(category)) return false
      if (normalizedQuery) {
        const haystack = `${list.name || ''} ${list.publicTagline || ''} ${list.bio || ''}`.toLowerCase()
        if (!haystack.includes(normalizedQuery)) return false
      }
      return true
    })
  }, [taskLists, q, area, category])

  const areas = useMemo(
    () => Array.from(new Set(taskLists.map((l) => l.area).filter(Boolean))) as string[],
    [taskLists]
  )
  const categories = useMemo(
    () => Array.from(new Set(taskLists.flatMap((l) => l.categories || []).filter(Boolean))) as string[],
    [taskLists]
  )

  return (
    <main className="container mx-auto max-w-5xl px-4 py-6 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t('jobs.board.title', { defaultValue: 'Job board' })}</h1>
          <p className="text-sm text-muted-foreground">
            {t('jobs.board.subtitle', { defaultValue: 'Open positions across published lists and projects' })}
          </p>
        </div>
        <Button onClick={() => setShowAddProject(true)}>
          {t('project.create', { defaultValue: 'New project' })}
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <Input
          className="max-w-xs"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('jobs.board.searchPlaceholder', { defaultValue: 'Search jobs...' })}
        />
        {/* Radix SelectItems reject empty values — "all" is the no-filter sentinel */}
        <Select value={area} onValueChange={(v) => setArea(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder={t('jobs.board.area', { defaultValue: 'Area' })} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('jobs.board.all', { defaultValue: 'All' })}</SelectItem>
            {areas.map((a) => (
              <SelectItem key={a} value={a}>{a}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={category} onValueChange={(v) => setCategory(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder={t('jobs.board.category', { defaultValue: 'Category' })} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('jobs.board.all', { defaultValue: 'All' })}</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* My projects */}
      {projects.length > 0 && (
        <section>
          <h2 className="font-semibold mb-2">{t('project.myProjects', { defaultValue: 'My projects' })}</h2>
          <div className="flex flex-wrap gap-2">
            {projects.map((p) => (
              <Link key={p.id} href={`/${locale}/p/${p.username}`}>
                <Card className="hover:shadow-md transition-shadow">
                  <CardContent className="py-2 px-3">
                    <span className="text-sm font-medium">{p.name}</span>{' '}
                    <span className="text-xs text-muted-foreground">@{p.username}</span>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Board */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((list) => (
          <Link key={list.id} href={`/${locale}/list/${list.publicUrl}`}>
            <Card className="h-full hover:shadow-md transition-shadow">
              <CardContent className="pt-4 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-semibold truncate">{list.name}</h3>
                  {list.likeCount != null && <span className="text-xs text-muted-foreground">♥ {list.likeCount}</span>}
                </div>
                {list.publicTagline && (
                  <p className="text-sm text-muted-foreground line-clamp-2">{list.publicTagline}</p>
                )}
                {list.project && (
                  <p className="text-xs text-primary">@{list.project.username}</p>
                )}
                {list.ownerProfile?.userName && (
                  <p className="text-xs text-muted-foreground">@{list.ownerProfile.userName}</p>
                )}
              </CardContent>
            </Card>
          </Link>
        ))}
        {filtered.length === 0 && (
          <p className="col-span-full text-sm text-muted-foreground">
            {t('jobs.board.empty', { defaultValue: 'No open positions yet.' })}
          </p>
        )}
      </section>

      <AddProjectForm
        open={showAddProject}
        onOpenChange={setShowAddProject}
        onCreated={async () => {
          await mutateProjects()
        }}
      />
    </main>
  )
}
