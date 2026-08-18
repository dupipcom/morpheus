'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useI18n } from '@/lib/contexts/i18n'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Heart, Star } from 'lucide-react'

/**
 * Public project page body (server shell + client action islands: like,
 * donate link). Events section arrives in Phase 8.
 */
export function PublicProjectView({
  project,
  locale
}: {
  project: any
  locale: string
}) {
  const { t } = useI18n()

  const [liked, setLiked] = useState<boolean>(project.viewer?.isLiked ?? false)
  const [likeCount, setLikeCount] = useState<number>(project.likeCount ?? 0)
  const [busy, setBusy] = useState(false)

  const toggleLike = async () => {
    if (busy) return
    setBusy(true)
    try {
      const res = await fetch('/api/v1/likes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityType: 'project', entityId: project.id || project._id })
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

  const links = Array.isArray(project.links) ? project.links : []
  const stats = project.stats || {}

  return (
    <main className="container mx-auto max-w-4xl px-4 py-6 space-y-6">
      {/* Hero */}
      <Card className="overflow-hidden">
        {project.cover && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={project.cover} alt="" className="w-full h-48 object-cover" />
        )}
        <CardContent className="space-y-3 pt-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              {project.photo && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={project.photo} alt="" className="w-14 h-14 rounded-full object-cover" />
              )}
              <div>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                  {project.name}
                  {project.spotlight && <Star className="h-5 w-5 fill-current text-amber-500" />}
                </h1>
                <p className="text-sm text-muted-foreground">@{project.username}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant={liked ? 'default' : 'outline'}
                size="sm"
                onClick={toggleLike}
                disabled={busy}
                aria-label={t('project.like', { defaultValue: 'Like' })}
              >
                <Heart className={`h-4 w-4 mr-1 ${liked ? 'fill-current' : ''}`} />
                {likeCount}
              </Button>
              {project.supportUrl && (
                <a href={project.supportUrl} target="_blank" rel="noopener noreferrer">
                  <Button size="sm">
                    {t('project.donate', { defaultValue: 'Support / Donate' })}
                  </Button>
                </a>
              )}
            </div>
          </div>

          {project.ownerProfile?.userName && (
            <p className="text-sm text-muted-foreground">@{project.ownerProfile.userName}</p>
          )}

          {/* Stats (computed server-side in the serializer) */}
          <div className="flex gap-6 text-sm">
            <span>
              <strong>{stats.listCount ?? 0}</strong>{' '}
              {t('project.statsLists', { defaultValue: 'job boards' })}
            </span>
            <span>
              <strong>{stats.memberCount ?? 0}</strong>{' '}
              {t('project.statsMembers', { defaultValue: 'members' })}
            </span>
            <span>
              <strong>{stats.likeCount ?? 0}</strong>{' '}
              {t('project.statsLikes', { defaultValue: 'likes' })}
            </span>
          </div>

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
        </CardContent>
      </Card>

      {/* About */}
      {project.bio && (
        <Card>
          <CardContent className="pt-4">
            <h2 className="font-semibold mb-1">
              {t('project.about', { defaultValue: 'About' })}
            </h2>
            <p className="text-sm whitespace-pre-line">{project.bio}</p>
          </CardContent>
        </Card>
      )}

      {/* Job boards (published lists) */}
      {(project.publishedLists || []).length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">
            {t('project.jobBoards', { defaultValue: 'Job boards' })}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {(project.publishedLists as any[]).map((list) => (
              <Link key={list.id} href={`/${locale}/list/${list.publicUrl}`}>
                <Card className="h-full hover:shadow-md transition-shadow">
                  <CardContent className="pt-4 space-y-1">
                    <h3 className="font-semibold">{list.name}</h3>
                    {list.publicTagline && (
                      <p className="text-sm text-muted-foreground">{list.publicTagline}</p>
                    )}
                    {list.location?.name && (
                      <p className="text-xs text-muted-foreground">{list.location.name}</p>
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
