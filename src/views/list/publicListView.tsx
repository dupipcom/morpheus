'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useI18n } from '@/lib/contexts/i18n'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Heart, MapPin, UserPlus, Check } from 'lucide-react'

/**
 * Public list page body. The page shell is a server component (SEO); this
 * view receives the allowlist-projected payload and only the action buttons
 * are interactive islands (like / request to join).
 */
export function PublicListView({
  taskList,
  locale
}: {
  taskList: any
  locale: string
}) {
  const { t } = useI18n()

  const [liked, setLiked] = useState<boolean>(taskList.viewer?.isLiked ?? false)
  const [likeCount, setLikeCount] = useState<number>(taskList.likeCount ?? 0)
  const [requested, setRequested] = useState<boolean>(taskList.viewer?.hasPendingRequest ?? false)
  const [isMember, setIsMember] = useState<boolean>(taskList.viewer?.isMember ?? false)
  const [busy, setBusy] = useState(false)

  const toggleLike = async () => {
    if (busy) return
    setBusy(true)
    try {
      const res = await fetch('/api/v1/likes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityType: 'tasklist', entityId: taskList.id || taskList._id })
      })
      if (res.ok) {
        setLiked((prev) => !prev)
        setLikeCount((prev) => (liked ? Math.max(0, prev - 1) : prev + 1))
      }
    } catch (error) {
      console.error('Error toggling like:', error)
    } finally {
      setBusy(false)
    }
  }

  const requestToJoin = async () => {
    if (busy) return
    setBusy(true)
    try {
      const res = await fetch(`/api/v1/tasklists/${taskList.id || taskList._id}/candidate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })
      if (res.ok) setRequested(true)
    } catch (error) {
      console.error('Error requesting to join:', error)
    } finally {
      setBusy(false)
    }
  }

  const listId = taskList.id || taskList._id
  const links = Array.isArray(taskList.links) ? taskList.links : []

  return (
    <main className="container mx-auto max-w-4xl px-4 py-6 space-y-6">
      {/* Hero */}
      <Card className="overflow-hidden">
        {taskList.cover && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={taskList.cover} alt="" className="w-full h-48 object-cover" />
        )}
        <CardContent className="space-y-3 pt-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              {taskList.profilePhoto && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={taskList.profilePhoto} alt="" className="w-14 h-14 rounded-full object-cover" />
              )}
              <div>
                <h1 className="text-2xl font-bold">{taskList.name}</h1>
                {taskList.publicTagline && (
                  <p className="text-muted-foreground">{taskList.publicTagline}</p>
                )}
              </div>
            </div>
            <Button
              variant={liked ? 'default' : 'outline'}
              size="sm"
              onClick={toggleLike}
              disabled={busy}
              aria-label={t('list.public.like', { defaultValue: 'Like' })}
            >
              <Heart className={`h-4 w-4 mr-1 ${liked ? 'fill-current' : ''}`} />
              {likeCount}
            </Button>
          </div>

          {taskList.project && (
            <Link
              href={`/${locale}/p/${taskList.project.publicUrl}`}
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
            >
              {t('list.public.partOfProject', { defaultValue: 'Part of' })} {taskList.project.name}
            </Link>
          )}

          {taskList.ownerProfile?.userName && (
            <p className="text-sm text-muted-foreground">
              @{taskList.ownerProfile.userName}
            </p>
          )}

          {taskList.location?.name && (
            <p className="flex items-center gap-1 text-sm text-muted-foreground">
              <MapPin className="h-4 w-4" /> {taskList.location.name}
            </p>
          )}

          {links.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {links.map((link: any, index: number) => (
                <a
                  key={index}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline"
                >
                  {link.label}
                </a>
              ))}
            </div>
          )}

          {!isMember && (
            <Button
              variant="outline"
              size="sm"
              onClick={requestToJoin}
              disabled={busy || requested}
            >
              {requested ? (
                <Check className="h-4 w-4 mr-1" />
              ) : (
                <UserPlus className="h-4 w-4 mr-1" />
              )}
              {requested
                ? t('list.public.requestPending', { defaultValue: 'Request pending' })
                : t('list.public.requestToJoin', { defaultValue: 'Request to join' })}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* About */}
      {taskList.bio && (
        <Card>
          <CardContent className="pt-4">
            <h2 className="font-semibold mb-1">
              {t('list.public.about', { defaultValue: 'About' })}
            </h2>
            <p className="text-sm whitespace-pre-line">{taskList.bio}</p>
          </CardContent>
        </Card>
      )}

      {/* Open positions */}
      {(taskList.publicTasks || []).length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">
            {t('list.public.openPositions', { defaultValue: 'Open positions' })}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {(taskList.publicTasks as any[]).map((task) => (
              <Link key={task.id} href={`/${locale}/list/${taskList.publicUrl}/jobs/${task.id}`}>
                <Card className="h-full hover:shadow-md transition-shadow">
                  <CardContent className="pt-4 space-y-1">
                    <h3 className="font-semibold">{task.name}</h3>
                    {task.jobDescription && (
                      <p className="text-sm text-muted-foreground line-clamp-2">{task.jobDescription}</p>
                    )}
                    {task.applyBy && (
                      <p className="text-xs text-muted-foreground">
                        {t('list.public.applyBy', { defaultValue: 'Apply by' })} {task.applyBy}
                      </p>
                    )}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  )
}
