'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import useSWR from 'swr'
import { useI18n } from '@/lib/contexts/i18n'
import { jsonFetcher } from '@/lib/utils/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

interface OrgCard {
  id: string
  name: string
  username: string
  imageUrl: string | null
  bio: string | null
  publicVisible: boolean
  viewerRole: string
}

/**
 * Organizations directory (Phase 7): the viewer's orgs, create organization,
 * publish toggle and per-org cards. Replaces the disabled BeView tab.
 */
export default function OrganizationsPage() {
  const { locale } = useParams<{ locale: string }>()
  const { t } = useI18n()

  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data, mutate } = useSWR<{ orgs: OrgCard[] }>('/api/v1/orgs', jsonFetcher, {
    revalidateOnFocus: false
  })
  const orgs = data?.orgs || []

  const handleCreate = async () => {
    if (!newName.trim() || isSubmitting) return
    setIsSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/v1/orgs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() })
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error || 'Failed to create organization')
      }
      setNewName('')
      setShowCreate(false)
      await mutate()
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Failed to create organization')
    } finally {
      setIsSubmitting(false)
    }
  }

  const togglePublish = async (org: OrgCard) => {
    if (!['OWNER', 'ADMIN'].includes(org.viewerRole)) return
    const res = await fetch(`/api/v1/orgs/${org.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ publicVisible: !org.publicVisible })
    })
    if (res.ok) await mutate()
  }

  return (
    <main className="container mx-auto max-w-4xl px-4 py-6 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">
            {t('org.directoryTitle', { defaultValue: 'Organizations' })}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t('org.directorySubtitle', { defaultValue: 'Create and manage organizations' })}
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          {t('org.create', { defaultValue: 'New organization' })}
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {orgs.map((org) => (
          <Card key={org.id} className="h-full">
            <CardContent className="pt-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {org.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={org.imageUrl} alt="" className="w-10 h-10 rounded-full object-cover" />
                  )}
                  <div>
                    <h3 className="font-semibold">{org.name}</h3>
                    <p className="text-xs text-muted-foreground">@{org.username} · {org.viewerRole}</p>
                  </div>
                </div>
                {['OWNER', 'ADMIN'].includes(org.viewerRole) && (
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">
                      {t('org.published', { defaultValue: 'Public' })}
                    </span>
                    <Switch
                      checked={org.publicVisible}
                      onCheckedChange={() => togglePublish(org)}
                      aria-label={t('org.publishToggle', { defaultValue: 'Publish organization' })}
                    />
                  </div>
                )}
              </div>
              {org.publicVisible && (
                <Link
                  href={`/${locale}/o/${org.username}`}
                  className="text-sm text-primary hover:underline"
                >
                  /{locale}/o/{org.username} · @{org.username}
                </Link>
              )}
            </CardContent>
          </Card>
        ))}
        {orgs.length === 0 && (
          <p className="col-span-full text-sm text-muted-foreground">
            {t('org.empty', { defaultValue: 'You are not part of any organization yet.' })}
          </p>
        )}
      </div>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="w-[480px] max-w-[90vw] z-[9980]">
          <DialogHeader>
            <DialogTitle>{t('org.create', { defaultValue: 'New organization' })}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="org-name">{t('org.nameLabel', { defaultValue: 'Name' })}</Label>
              <Input
                id="org-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t('org.namePlaceholder', { defaultValue: 'Organization name...' })}
              />
            </div>
            {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
            <div className="flex gap-2">
              <Button onClick={handleCreate} disabled={!newName.trim() || isSubmitting}>
                {t('org.createButton', { defaultValue: 'Create' })}
              </Button>
              <Button variant="outline" onClick={() => setShowCreate(false)}>
                {t('org.cancel', { defaultValue: 'Cancel' })}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  )
}
