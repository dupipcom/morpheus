'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useI18n } from '@/lib/contexts/i18n'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Heart, BadgeCheck } from 'lucide-react'

/**
 * Public organization page body (server shell + client like island).
 * The Organization row IS the org's public profile (no Profile row).
 */
export function PublicOrgView({
  organization,
  locale
}: {
  organization: any
  locale: string
}) {
  const { t } = useI18n()

  const [liked, setLiked] = useState<boolean>(organization.viewer?.isLiked ?? false)
  const [likeCount, setLikeCount] = useState<number>(organization.likeCount ?? 0)
  const [busy, setBusy] = useState(false)

  const toggleLike = async () => {
    if (busy) return
    setBusy(true)
    try {
      const res = await fetch('/api/v1/likes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityType: 'org', entityId: organization.id })
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

  const links = Array.isArray(organization.links) ? organization.links : []
  const stats = organization.stats || {}

  return (
    <main className="container mx-auto max-w-4xl px-4 py-6 space-y-6">
      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              {organization.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={organization.imageUrl} alt="" className="w-14 h-14 rounded-full object-cover" />
              )}
              <div>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                  {organization.name}
                  {organization.verified && <BadgeCheck className="h-5 w-5 text-primary" />}
                </h1>
                <p className="text-sm text-muted-foreground">@{organization.username}</p>
              </div>
            </div>
            <Button
              variant={liked ? 'default' : 'outline'}
              size="sm"
              onClick={toggleLike}
              disabled={busy}
              aria-label={t('org.like', { defaultValue: 'Like' })}
            >
              <Heart className={`h-4 w-4 mr-1 ${liked ? 'fill-current' : ''}`} />
              {likeCount}
            </Button>
          </div>

          <div className="flex gap-6 text-sm">
            <span>
              <strong>{stats.memberCount ?? 0}</strong> {t('org.statsMembers', { defaultValue: 'members' })}
            </span>
            <span>
              <strong>{stats.listCount ?? 0}</strong> {t('org.statsLists', { defaultValue: 'published lists' })}
            </span>
            <span>
              <strong>{stats.projectCount ?? 0}</strong> {t('org.statsProjects', { defaultValue: 'projects' })}
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

      {organization.bio && (
        <Card>
          <CardContent className="pt-4">
            <h2 className="font-semibold mb-1">{t('org.about', { defaultValue: 'About' })}</h2>
            <p className="text-sm whitespace-pre-line">{organization.bio}</p>
          </CardContent>
        </Card>
      )}

      {(organization.publishedLists || []).length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">{t('org.lists', { defaultValue: 'Lists' })}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {(organization.publishedLists as any[]).map((list) => (
              <Link key={list.id} href={`/${locale}/list/${list.publicUrl}`}>
                <Card className="h-full hover:shadow-md transition-shadow">
                  <CardContent className="pt-4">
                    <h3 className="font-semibold">{list.name}</h3>
                    {list.publicTagline && (
                      <p className="text-sm text-muted-foreground">{list.publicTagline}</p>
                    )}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}

      {(organization.publishedProjects || []).length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">{t('org.projects', { defaultValue: 'Projects' })}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {(organization.publishedProjects as any[]).map((project) => (
              <Link key={project.id} href={`/${locale}/p/${project.username}`}>
                <Card className="h-full hover:shadow-md transition-shadow">
                  <CardContent className="pt-4">
                    <h3 className="font-semibold">{project.name}</h3>
                    <p className="text-xs text-muted-foreground">@{project.username}</p>
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
