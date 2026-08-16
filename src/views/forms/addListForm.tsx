'use client'

import React, { useState, useEffect, useMemo } from 'react'
import useSWR from 'swr'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { X } from 'lucide-react'
import { useI18n } from '@/lib/contexts/i18n'
import { useFriendProfiles, FriendProfile } from '@/lib/hooks/useFriendProfiles'
import { jsonFetcher } from '@/lib/utils/utils'

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
      } else {
        setName('')
        setVisibility('PRIVATE')
        setBudgetType('FIAT')
        setBudget('')
        setBudgetPercent('')
        setBudgetSourceIds([])
        setCollaborators([])
      }
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

      const body = {
        name: name.trim(),
        visibility,
        collaborators: collaborators.map((c) => c.userId),
        budget: parsedBudget,
        budgetType: parsedBudget != null || budgetSourceIds.length > 0 ? budgetType : null,
        budgetPercent: budgetType === 'PERCENT' ? parsedBudgetPercent : null,
        budgetSourceIds: budgetType === 'PERCENT' ? budgetSourceIds : [],
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
