'use client'

import React, { useState, useEffect, useMemo } from 'react'
import useSWR from 'swr'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Check, Loader, X } from 'lucide-react'
import { useI18n } from '@/lib/contexts/i18n'
import { useFriendProfiles, FriendProfile } from '@/lib/hooks/useFriendProfiles'
import { useDebounce } from '@/lib/hooks/useDebounce'
import { jsonFetcher } from '@/lib/utils/utils'
import {
  AttachmentPicker,
  commitAttachmentToEntity,
  attachmentFileUrl,
  type PickedAttachment
} from '@/components/attachmentPicker'

const VISIBILITY_OPTIONS = ['PRIVATE', 'PUBLIC', 'FRIENDS', 'CLOSE_FRIENDS', 'HIDDEN'] as const

interface BudgetRecord {
  id: string
  name: string
  totalAmount: number
  remainingAmount: number
}

export const AddListForm = ({
  open,
  onOpenChange,
  isEditing = false,
  initialList,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  isEditing?: boolean
  initialList?: any
  onCreated: (newListId?: string) => Promise<void> | void
}) => {
  const { t } = useI18n()

  // Form state
  const [name, setName] = useState('')
  const [visibility, setVisibility] = useState<string>('PRIVATE')
  const [budgetType, setBudgetType] = useState<string>('FIAT')
  const [budget, setBudget] = useState<string>('')
  const [budgetPercent, setBudgetPercent] = useState<string>('')
  const [budgetSourceIds, setBudgetSourceIds] = useState<string[]>([])
  const [collaborators, setCollaborators] = useState<FriendProfile[]>([])
  const [collabQuery, setCollabQuery] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Public profile (Phase 5)
  const [publicTagline, setPublicTagline] = useState('')
  const [publicBio, setPublicBio] = useState('')
  // Cover image: uploaded via the attachments pipeline (create-flow contract —
  // committed to the list after it exists). Seeded with the existing cover in
  // edit mode; a removed seed clears the cover on save.
  const [covers, setCovers] = useState<PickedAttachment[]>([])
  const [links, setLinks] = useState<Array<{ label: string; url: string }>>([])
  const [publicVisible, setPublicVisible] = useState(false)
  const [jobBoardEnabled, setJobBoardEnabled] = useState(false)
  const [projectId, setProjectId] = useState<string>('')

  // The viewer's projects (for the project selector)
  const { data: projectsData, mutate: mutateProjects } = useSWR<{ projects: Array<{ id: string; name: string; username: string }> }>(
    open ? '/api/v1/projects' : null,
    jsonFetcher,
    { revalidateOnFocus: false }
  )
  const projects = projectsData?.projects || []

  // Inline project creation with @handle availability (shared /@ namespace)
  const [showCreateProject, setShowCreateProject] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [newProjectHandle, setNewProjectHandle] = useState('')
  const [handleStatus, setHandleStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle')
  const [isCreatingProject, setIsCreatingProject] = useState(false)

  const handleFromInput = (value: string) => value.trim().replace(/^@/, '').toLowerCase()

  const checkHandleAvailability = useDebounce(async (value: string) => {
    const candidate = handleFromInput(value)
    if (!candidate) {
      setHandleStatus('idle')
      return
    }
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(candidate)) {
      setHandleStatus('invalid')
      return
    }
    setHandleStatus('checking')
    try {
      const res = await fetch(`/api/v1/projects/available?username=${encodeURIComponent(candidate)}`)
      if (!res.ok) {
        setHandleStatus('idle')
        return
      }
      const data = (await res.json()) as { available?: boolean }
      setHandleStatus(data?.available ? 'available' : 'taken')
    } catch {
      setHandleStatus('idle')
    }
  }, 400)

  const handleCreateProject = async () => {
    const candidate = handleFromInput(newProjectHandle)
    if (!newProjectName.trim() || !candidate || handleStatus !== 'available' || isCreatingProject) return
    setIsCreatingProject(true)
    try {
      const res = await fetch('/api/v1/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newProjectName.trim(), username: candidate })
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setHandleStatus(data?.error === 'That handle is already taken' ? 'taken' : 'idle')
        return
      }
      const data = (await res.json()) as { project?: { id?: string } }
      if (data?.project?.id) {
        setProjectId(data.project.id)
        await mutateProjects()
      }
      setShowCreateProject(false)
      setNewProjectName('')
      setNewProjectHandle('')
      setHandleStatus('idle')
    } catch (error) {
      console.error('Error creating project:', error)
      setHandleStatus('idle')
    } finally {
      setIsCreatingProject(false)
    }
  }

  const addLink = () => setLinks((prev) => [...prev, { label: '', url: '' }])
  const updateLink = (index: number, field: 'label' | 'url', value: string) =>
    setLinks((prev) => prev.map((l, i) => (i === index ? { ...l, [field]: value } : l)))
  const removeLink = (index: number) => setLinks((prev) => prev.filter((_, i) => i !== index))

  // The user's own budgets (for PERCENT budget sources)
  const { data: budgetsData, mutate: mutateBudgets } = useSWR<{ budgets: BudgetRecord[] }>(
    open ? '/api/v1/budgets' : null,
    jsonFetcher,
    { revalidateOnFocus: false }
  )
  const budgets = budgetsData?.budgets || []

  // New budget quick-add
  const [newBudgetName, setNewBudgetName] = useState('')
  const [newBudgetAmount, setNewBudgetAmount] = useState('')
  const [isAddingBudget, setIsAddingBudget] = useState(false)

  // Collaborator suggestions
  const { profiles } = useFriendProfiles(collabQuery || null)
  const filteredSuggestions = useMemo(
    () => profiles.filter((p) => !collaborators.some((c) => c.userId === p.userId)).slice(0, 5),
    [profiles, collaborators]
  )

  // Reset form when dialog opens/closes or when switching create/edit
  useEffect(() => {
    if (open) {
      if (isEditing && initialList) {
        setName(initialList.name || '')
        setVisibility(initialList.visibility || 'PRIVATE')
        setBudgetType(initialList.budgetType || 'FIAT')
        setBudget(initialList.budget != null ? String(initialList.budget) : '')
        setBudgetPercent(initialList.budgetPercent != null ? String(initialList.budgetPercent) : '')
        setBudgetSourceIds(initialList.budgetSourceIds || [])
        setCollaborators(
          (initialList.users || [])
            .filter((u: any) => u.role === 'COLLABORATOR' || u.role === 'MANAGER')
            .map((u: any) => ({ userId: u.userId, userName: u.userName || u.userId }))
        )
        setPublicTagline(initialList.publicTagline || '')
        setPublicBio(initialList.bio || '')
        setCovers(
          initialList.coverDocumentId
            ? [{
                key: `cover-${initialList.coverDocumentId}`,
                publicUrl: attachmentFileUrl(initialList.coverDocumentId),
                fileName: 'cover',
                mimeType: 'image/jpeg',
                kind: 'image',
                size: 0,
                documentId: initialList.coverDocumentId
              }]
            : []
        )
        setLinks(Array.isArray(initialList.links) ? initialList.links : [])
        setPublicVisible(initialList.publicVisible === true)
        setJobBoardEnabled(initialList.jobBoardEnabled === true)
        setProjectId(initialList.projectId || '')
      } else {
        setName('')
        setVisibility('PRIVATE')
        setBudgetType('FIAT')
        setBudget('')
        setBudgetPercent('')
        setBudgetSourceIds([])
        setCollaborators([])
        setPublicTagline('')
        setPublicBio('')
        setCovers([])
        setLinks([])
        setPublicVisible(false)
        setJobBoardEnabled(false)
        setProjectId('')
      }
      setShowCreateProject(false)
      setNewProjectName('')
      setNewProjectHandle('')
      setHandleStatus('idle')
      setIsCreatingProject(false)
      setCollabQuery('')
      setNewBudgetName('')
      setNewBudgetAmount('')
      setIsSubmitting(false)
    }
  }, [open, isEditing, initialList])

  const addCollaborator = (profile: FriendProfile) => {
    setCollaborators((prev) => (prev.some((c) => c.userId === profile.userId) ? prev : [...prev, profile]))
    setCollabQuery('')
  }

  const removeCollaborator = (userId: string) => {
    setCollaborators((prev) => prev.filter((c) => c.userId !== userId))
  }

  const toggleBudgetSource = (budgetId: string) => {
    setBudgetSourceIds((prev) =>
      prev.includes(budgetId) ? prev.filter((id) => id !== budgetId) : [...prev, budgetId]
    )
  }

  const handleAddBudget = async () => {
    if (!newBudgetName.trim() || isAddingBudget) return
    setIsAddingBudget(true)
    try {
      await fetch('/api/v1/budgets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newBudgetName.trim(),
          totalAmount: parseFloat(newBudgetAmount) || 0,
        }),
      })
      setNewBudgetName('')
      setNewBudgetAmount('')
      await mutateBudgets()
    } catch (error) {
      console.error('Error creating budget:', error)
    } finally {
      setIsAddingBudget(false)
    }
  }

  const handleSubmit = async () => {
    if (!name.trim() || isSubmitting) return
    setIsSubmitting(true)
    try {
      const parsedBudget = budget.trim() === '' ? null : parseFloat(budget)
      const parsedBudgetPercent = budgetPercent.trim() === '' ? null : parseFloat(budgetPercent)

      // Cover: a seeded item (edit mode) carries its documentId; a removed seed
      // clears the cover (null). New uploads commit after the list exists.
      const existingCoverId = covers.find((c) => c.documentId)?.documentId ?? null

      const body = {
        name: name.trim(),
        visibility,
        collaborators: collaborators.map((c) => c.userId),
        budget: parsedBudget,
        budgetType: parsedBudget != null || budgetSourceIds.length > 0 ? budgetType : null,
        budgetPercent: budgetType === 'PERCENT' ? parsedBudgetPercent : null,
        budgetSourceIds: budgetType === 'PERCENT' ? budgetSourceIds : [],
        publicTagline: publicTagline.trim() || null,
        bio: publicBio.trim() || null,
        coverDocumentId: existingCoverId,
        links: links.filter((l) => l.label.trim() && l.url.trim()).map((l) => ({ label: l.label.trim(), url: l.url.trim() })),
        publicVisible,
        jobBoardEnabled,
        projectId: projectId || null,
      }

      let newListId: string | undefined
      if (isEditing && initialList?.id) {
        const res = await fetch(`/api/v1/tasklists/${initialList.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) throw new Error('Failed to update list')
      } else {
        const res = await fetch('/api/v1/tasklists', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) throw new Error('Failed to create list')
        const data = await res.json()
        newListId = data?.taskList?.id
      }

      // Commit a newly uploaded cover to the list and link it. Failures only
      // break the image, never the list save (same contract as the event forms).
      const pendingCover = covers.find((c) => !c.documentId)
      const targetListId = newListId || initialList?.id
      if (pendingCover && targetListId) {
        try {
          const documentId = await commitAttachmentToEntity(pendingCover, 'list', targetListId, 'cover')
          await fetch(`/api/v1/tasklists/${targetListId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ coverDocumentId: documentId }),
          })
        } catch (coverError) {
          console.error('Error linking list cover:', coverError)
        }
      }

      await onCreated(newListId)
      onOpenChange(false)
    } catch (error) {
      console.error('Error saving list:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!isEditing || !initialList?.id) return
    if (!window.confirm(t('forms.addListForm.confirmDelete', { defaultValue: 'Delete this list and all its tasks? This cannot be undone.' }))) return

    setIsSubmitting(true)
    try {
      const res = await fetch(`/api/v1/tasklists/${initialList.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete list')
      await onCreated()
      onOpenChange(false)
    } catch (error) {
      console.error('Error deleting list:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[480px] max-w-[90vw] max-h-[70vh] z-[9980] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {isEditing
              ? (t('forms.addListForm.editTitle') || 'Edit List')
              : (t('forms.addListForm.title') || 'New List')}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 overflow-y-auto flex-1 pr-1">
          <div>
            <Label htmlFor="list-name">{t('forms.addListForm.nameLabel') || 'Name'}</Label>
            <Input
              id="list-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('forms.addListForm.namePlaceholder') || 'List name...'}
            />
          </div>

          <div>
            <Label htmlFor="list-visibility">{t('forms.addListForm.visibilityLabel', { defaultValue: 'Visibility' })}</Label>
            <Select value={visibility} onValueChange={setVisibility}>
              <SelectTrigger id="list-visibility" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VISIBILITY_OPTIONS.map((v) => (
                  <SelectItem key={v} value={v}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="list-collaborators">{t('forms.addListForm.collaboratorsLabel', { defaultValue: 'Collaborators' })}</Label>
            {collaborators.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-1">
                {collaborators.map((c) => (
                  <Badge key={c.userId} variant="secondary" className="gap-1">
                    @{c.userName || c.userId.slice(0, 8)}
                    <button type="button" onClick={() => removeCollaborator(c.userId)} aria-label="Remove">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
            <Input
              id="list-collaborators"
              value={collabQuery}
              onChange={(e) => setCollabQuery(e.target.value)}
              placeholder={t('forms.addListForm.collaboratorsPlaceholder', { defaultValue: 'Search friends...' })}
            />
            {filteredSuggestions.length > 0 && collabQuery.trim() && (
              <div className="border rounded-md mt-1 max-h-32 overflow-y-auto">
                {filteredSuggestions.map((p) => (
                  <button
                    key={p.userId}
                    type="button"
                    className="w-full text-left px-2 py-1.5 text-sm hover:bg-muted"
                    onClick={() => addCollaborator(p)}
                  >
                    @{p.userName || p.userId.slice(0, 8)}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Public profile (Phase 5) */}
          <div className="space-y-2 rounded-md border p-3">
            <div className="text-sm font-medium">
              {t('forms.addListForm.publicProfileTitle', { defaultValue: 'Public profile (optional)' })}
            </div>
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="list-public-visible" className="text-sm">
                {t('forms.addListForm.publishLabel', { defaultValue: 'Publish list' })}
              </Label>
              <Switch
                id="list-public-visible"
                checked={publicVisible}
                onCheckedChange={(checked) => setPublicVisible(checked === true)}
              />
            </div>
            <div>
              <Label htmlFor="list-tagline">{t('forms.addListForm.taglineLabel', { defaultValue: 'Tagline' })}</Label>
              <Input
                id="list-tagline"
                value={publicTagline}
                onChange={(e) => setPublicTagline(e.target.value)}
                placeholder={t('forms.addListForm.taglinePlaceholder', { defaultValue: 'One line about this list...' })}
              />
            </div>
            <div>
              <Label htmlFor="list-bio">{t('forms.addListForm.bioLabel', { defaultValue: 'Bio' })}</Label>
              <Input
                id="list-bio"
                value={publicBio}
                onChange={(e) => setPublicBio(e.target.value)}
                placeholder={t('forms.addListForm.bioPlaceholder', { defaultValue: 'About this list...' })}
              />
            </div>
            <div>
              <Label htmlFor="list-cover">{t('forms.addListForm.coverLabel', { defaultValue: 'List image' })}</Label>
              <AttachmentPicker
                entityType="list"
                role="cover"
                kind="image"
                max={1}
                compact
                value={covers}
                onChange={setCovers}
              />
            </div>
            <div className="space-y-1">
              <Label>{t('forms.addListForm.linksLabel', { defaultValue: 'Links' })}</Label>
              {links.map((link, index) => (
                <div key={index} className="flex gap-1">
                  <Input
                    className="flex-1"
                    value={link.label}
                    onChange={(e) => updateLink(index, 'label', e.target.value)}
                    placeholder={t('forms.addListForm.linkLabelPlaceholder', { defaultValue: 'Label' })}
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
                {t('forms.addListForm.addLink', { defaultValue: '+ Add link' })}
              </Button>
            </div>
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="list-job-board" className="text-sm">
                {t('forms.addListForm.jobBoardLabel', { defaultValue: 'Enable job board' })}
              </Label>
              <Switch
                id="list-job-board"
                checked={jobBoardEnabled}
                onCheckedChange={(checked) => setJobBoardEnabled(checked === true)}
              />
            </div>
            <div>
              <Label htmlFor="list-project">{t('forms.addListForm.projectLabel', { defaultValue: 'Project' })}</Label>
              {/* Radix SelectItems reject empty values — sentinels are mapped
                  back to the empty-string state on change */}
              <Select
                value={projectId}
                onValueChange={(v) => {
                  if (v === '__create__') {
                    setShowCreateProject(true)
                    return
                  }
                  setProjectId(v === 'none' ? '' : v)
                }}
              >
                <SelectTrigger id="list-project" className="w-full">
                  <SelectValue placeholder={t('forms.addListForm.projectPlaceholder', { defaultValue: 'None' })} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('forms.addListForm.noProject', { defaultValue: 'None' })}</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name} (@{p.username})</SelectItem>
                  ))}
                  <SelectItem value="__create__">{t('forms.addListForm.createProjectOption', { defaultValue: '+ Create new project' })}</SelectItem>
                </SelectContent>
              </Select>
              {showCreateProject && (
                <div className="mt-2 space-y-2 rounded-md border p-2">
                  <Input
                    id="list-new-project-name"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    placeholder={t('forms.addListForm.newProjectName', { defaultValue: 'Project name...' })}
                  />
                  <div>
                    <Label htmlFor="list-new-project-handle" className="text-xs text-muted-foreground">
                      @{t('forms.addListForm.newProjectHandle', { defaultValue: 'handle' })}
                    </Label>
                    <div className="relative">
                      <Input
                        id="list-new-project-handle"
                        value={newProjectHandle}
                        onChange={(e) => {
                          setNewProjectHandle(e.target.value)
                          checkHandleAvailability(e.target.value)
                        }}
                        placeholder={t('forms.addListForm.newProjectHandlePlaceholder', { defaultValue: 'my-project' })}
                        aria-invalid={handleStatus === 'taken' || handleStatus === 'invalid'}
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2">
                        {handleStatus === 'checking' && <Loader className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden />}
                        {handleStatus === 'available' && <Check className="h-4 w-4 text-green-600" aria-hidden />}
                        {(handleStatus === 'taken' || handleStatus === 'invalid') && <X className="h-4 w-4 text-destructive" aria-hidden />}
                      </span>
                    </div>
                    {handleStatus === 'available' && (
                      <p className="text-xs text-green-600">
                        {t('forms.addListForm.handleAvailable', { defaultValue: 'Handle is available' })}
                      </p>
                    )}
                    {handleStatus === 'taken' && (
                      <p className="text-xs text-destructive" role="alert">
                        {t('forms.addListForm.handleTaken', { defaultValue: 'That handle is already taken' })}
                      </p>
                    )}
                    {handleStatus === 'invalid' && (
                      <p className="text-xs text-destructive" role="alert">
                        {t('forms.addListForm.handleInvalid', { defaultValue: 'Use lowercase letters, digits and dashes only' })}
                      </p>
                    )}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleCreateProject}
                    disabled={!newProjectName.trim() || handleStatus !== 'available' || isCreatingProject}
                  >
                    {isCreatingProject
                      ? t('forms.addListForm.creatingProject', { defaultValue: 'Creating…' })
                      : t('forms.addListForm.createProjectButton', { defaultValue: 'Create project' })}
                  </Button>
                </div>
              )}
            </div>
            {isEditing && initialList?.publicUrl && (
              <p className="text-xs text-muted-foreground">
                {t('forms.addListForm.publicUrlLabel', { defaultValue: 'Public URL' })}: /list/{initialList.publicUrl}
              </p>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="list-budget-type">{t('forms.addListForm.budgetLabel', { defaultValue: 'Budget' })}</Label>
            <Select value={budgetType} onValueChange={setBudgetType}>
              <SelectTrigger id="list-budget-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="FIAT">$</SelectItem>
                <SelectItem value="PERCENT">%</SelectItem>
              </SelectContent>
            </Select>
            {budgetType === 'FIAT' ? (
              <Input
                type="number"
                min={0}
                step="0.01"
                value={budget}
                placeholder="0"
                onChange={(e) => setBudget(e.target.value)}
              />
            ) : (
              <>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  value={budgetPercent}
                  placeholder="0"
                  onChange={(e) => setBudgetPercent(e.target.value)}
                />
                <div className="text-xs text-muted-foreground">
                  {t('forms.addListForm.budgetSourcesLabel', { defaultValue: 'Percent of your budgets:' })}
                </div>
                {budgets.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    {t('forms.addListForm.noBudgets', { defaultValue: 'No budgets yet — add one below.' })}
                  </p>
                )}
                <div className="flex flex-wrap gap-1">
                  {budgets.map((b) => (
                    <Badge
                      key={b.id}
                      variant={budgetSourceIds.includes(b.id) ? 'default' : 'outline'}
                      className="cursor-pointer"
                      onClick={() => toggleBudgetSource(b.id)}
                    >
                      {b.name} (${b.remainingAmount})
                    </Badge>
                  ))}
                </div>
                <div className="flex gap-2 pt-1">
                  <Input
                    value={newBudgetName}
                    onChange={(e) => setNewBudgetName(e.target.value)}
                    placeholder={t('forms.addListForm.newBudgetName', { defaultValue: 'Budget name' })}
                  />
                  <Input
                    type="number"
                    min={0}
                    className="w-24"
                    value={newBudgetAmount}
                    onChange={(e) => setNewBudgetAmount(e.target.value)}
                    placeholder="0"
                  />
                  <Button type="button" size="sm" variant="outline" onClick={handleAddBudget} disabled={isAddingBudget || !newBudgetName.trim()}>
                    +
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <Button onClick={handleSubmit} disabled={!name.trim() || isSubmitting} size="sm">
            {isEditing
              ? (t('forms.addListForm.save') || 'Save')
              : (t('forms.addListForm.create') || 'Create')}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)} size="sm">
            {t('forms.addListForm.cancel') || 'Cancel'}
          </Button>
          {isEditing && initialList?.id && (
            <Button variant="destructive" size="sm" className="ml-auto" onClick={handleDelete} disabled={isSubmitting}>
              {t('forms.addListForm.delete') || 'Delete'}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
