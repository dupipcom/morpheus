'use client'

import React, { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { X } from 'lucide-react'
import { useI18n } from '@/lib/contexts/i18n'

/**
 * Create project dialog (Phase 5). Creator becomes OWNER; the project starts
 * unpublished (publicVisible: false, opt-in). Photo/cover are Phase 4
 * document ids (uploaded via the attachments flow); support/donate is a link
 * until the post-Phase-6 DPIP donate follow-up.
 */
export const AddProjectForm = ({
  open,
  onOpenChange,
  onCreated
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => Promise<void> | void
}) => {
  const { t } = useI18n()

  const [name, setName] = useState('')
  const [bio, setBio] = useState('')
  const [photoDocumentId, setPhotoDocumentId] = useState('')
  const [coverDocumentId, setCoverDocumentId] = useState('')
  const [links, setLinks] = useState<Array<{ label: string; url: string }>>([])
  const [supportUrl, setSupportUrl] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setName('')
      setBio('')
      setPhotoDocumentId('')
      setCoverDocumentId('')
      setLinks([])
      setSupportUrl('')
      setIsSubmitting(false)
      setError(null)
    }
  }, [open])

  const addLink = () => setLinks((prev) => [...prev, { label: '', url: '' }])
  const updateLink = (index: number, field: 'label' | 'url', value: string) =>
    setLinks((prev) => prev.map((l, i) => (i === index ? { ...l, [field]: value } : l)))
  const removeLink = (index: number) => setLinks((prev) => prev.filter((_, i) => i !== index))

  const handleSubmit = async () => {
    if (!name.trim() || isSubmitting) return
    setIsSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/v1/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          bio: bio.trim() || null,
          photoDocumentId: photoDocumentId.trim() || null,
          coverDocumentId: coverDocumentId.trim() || null,
          links: links.filter((l) => l.label.trim() && l.url.trim()),
          supportUrl: supportUrl.trim() || null
        })
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || 'Failed to create project')
      }
      onOpenChange(false)
      await onCreated()
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to create project')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[480px] max-w-[90vw] max-h-[70vh] z-[9980] flex flex-col">
        <DialogHeader>
          <DialogTitle>{t('project.create', { defaultValue: 'New project' })}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 overflow-y-auto flex-1 pr-1">
          <div>
            <Label htmlFor="project-name">{t('project.nameLabel', { defaultValue: 'Name' })}</Label>
            <Input
              id="project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('project.namePlaceholder', { defaultValue: 'Project name...' })}
            />
          </div>
          <div>
            <Label htmlFor="project-bio">{t('project.bioLabel', { defaultValue: 'Bio' })}</Label>
            <textarea
              id="project-bio"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm min-h-[70px]"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder={t('project.bioPlaceholder', { defaultValue: 'What is this project about?' })}
            />
          </div>
          <div>
            <Label htmlFor="project-photo">{t('project.photoLabel', { defaultValue: 'Photo document ID (Phase 4 upload)' })}</Label>
            <Input
              id="project-photo"
              value={photoDocumentId}
              onChange={(e) => setPhotoDocumentId(e.target.value)}
              placeholder="ObjectId"
            />
          </div>
          <div>
            <Label htmlFor="project-cover">{t('project.coverLabel', { defaultValue: 'Cover document ID (16:9)' })}</Label>
            <Input
              id="project-cover"
              value={coverDocumentId}
              onChange={(e) => setCoverDocumentId(e.target.value)}
              placeholder="ObjectId"
            />
          </div>
          <div className="space-y-1">
            <Label>{t('project.linksLabel', { defaultValue: 'Links' })}</Label>
            {links.map((link, index) => (
              <div key={index} className="flex gap-1">
                <Input
                  className="flex-1"
                  value={link.label}
                  onChange={(e) => updateLink(index, 'label', e.target.value)}
                  placeholder={t('project.linkLabelPlaceholder', { defaultValue: 'Label' })}
                />
                <Input
                  className="flex-1"
                  value={link.url}
                  onChange={(e) => updateLink(index, 'url', e.target.value)}
                  placeholder="https://"
                />
                <Button type="button" size="sm" variant="outline" onClick={() => removeLink(index)} aria-label="Remove link">
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
            <Button type="button" size="sm" variant="outline" onClick={addLink}>
              {t('project.addLink', { defaultValue: '+ Add link' })}
            </Button>
          </div>
          <div>
            <Label htmlFor="project-support">{t('project.supportUrlLabel', { defaultValue: 'Support / donate link' })}</Label>
            <Input
              id="project-support"
              value={supportUrl}
              onChange={(e) => setSupportUrl(e.target.value)}
              placeholder="https://"
            />
          </div>
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        </div>
        <div className="flex gap-2 pt-2">
          <Button onClick={handleSubmit} disabled={!name.trim() || isSubmitting} size="sm">
            {t('project.createButton', { defaultValue: 'Create' })}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)} size="sm">
            {t('project.cancel', { defaultValue: 'Cancel' })}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
