'use client'

import React, { useState, useMemo } from 'react'
import type { SerializedEditorState } from 'lexical'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Editor, lexicalToHtml, isEditorEmpty, createEmptyState } from '@/components/editor'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import type { JobWithRelations } from '@/lib/services/job/types'
import { useI18n } from '@/lib/contexts/i18n'

type ReviewAction = 'accept' | 'validate' | 'reject'

interface JobReviewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  job: JobWithRelations | null
  onReview: (data: {
    action: ReviewAction
    reviewNoteContent?: string
    managerReview?: number
  }) => Promise<void>
}

export function JobReviewDialog({
  open,
  onOpenChange,
  job,
  onReview,
}: JobReviewDialogProps) {
  const { t } = useI18n()
  const [action, setAction] = useState<ReviewAction>('accept')
  const initialEditorState = useMemo(() => createEmptyState(), [])
  const [editorState, setEditorState] = useState<SerializedEditorState>(initialEditorState)
  const [managerReview, setManagerReview] = useState(85)
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (!job) return null

  const handleSubmitReview = async () => {
    setIsSubmitting(true)
    try {
      // Convert Lexical state to HTML for storage
      const reviewNoteContent = lexicalToHtml(editorState)
      await onReview({
        action,
        reviewNoteContent: reviewNoteContent || undefined,
        managerReview: action === 'accept' ? managerReview : undefined,
      })

      const messages: Record<ReviewAction, string> = {
        accept: t('jobs.review.messages.accepted'),
        validate: t('jobs.review.messages.changesRequested'),
        reject: t('jobs.review.messages.rejected'),
      }

      toast.success(messages[action])

      onOpenChange(false)
      setEditorState(createEmptyState())
      setManagerReview(85)
      setAction('accept')
    } catch (error) {
      toast.error(t('jobs.review.messages.error'))
      console.error('Error submitting review:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleOpenChange = (newOpen: boolean) => {
    if (!isSubmitting) {
      onOpenChange(newOpen)
      if (!newOpen) {
        // Reset form when closing
        setEditorState(createEmptyState())
        setManagerReview(85)
        setAction('accept')
      }
    }
  }

  const workerName = job.worker?.profiles?.[0]?.username || 'Unknown'

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col z-[9999]">
        <DialogHeader>
          <DialogTitle>{t('jobs.review.title')}</DialogTitle>
          <DialogDescription>
            {t('jobs.review.description', { workerName: `@${workerName}` })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4 overflow-y-auto flex-1">
          {/* Worker's Submission */}
          <div className="p-4 bg-muted rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">{t('jobs.review.workerSolution')}</Label>
              {job.selfReview !== null && job.selfReview !== undefined && (
                <Badge variant="secondary">{t('jobs.review.selfReviewScore', { score: job.selfReview })}</Badge>
              )}
            </div>
            {job.requesterNotes && job.requesterNotes.length > 0 ? (
              job.requesterNotes.map((note) => (
                <div
                  key={note.id}
                  className="prose prose-sm dark:prose-invert max-w-none mt-2"
                  dangerouslySetInnerHTML={{ __html: note.content }}
                />
              ))
            ) : (
              <p className="text-sm text-muted-foreground italic">
                {t('jobs.review.noSubmissionNotes')}
              </p>
            )}
          </div>

          {/* Review Action */}
          <div>
            <Label className="text-sm font-semibold mb-3 block">{t('jobs.review.actionLabel')}</Label>
            <RadioGroup value={action} onValueChange={(v) => setAction(v as ReviewAction)}>
              <div className="space-y-3">
                <div
                  className={`flex items-start space-x-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                    action === 'accept'
                      ? 'border-primary bg-primary/5'
                      : 'hover:bg-accent/50'
                  }`}
                  onClick={() => setAction('accept')}
                >
                  <RadioGroupItem value="accept" id="accept" className="mt-0.5" />
                  <div className="flex-1">
                    <Label htmlFor="accept" className="font-medium cursor-pointer">
                      {t('jobs.review.actions.accept.title')}
                    </Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      {t('jobs.review.actions.accept.description')}
                    </p>
                  </div>
                </div>

                <div
                  className={`flex items-start space-x-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                    action === 'validate'
                      ? 'border-primary bg-primary/5'
                      : 'hover:bg-accent/50'
                  }`}
                  onClick={() => setAction('validate')}
                >
                  <RadioGroupItem value="validate" id="validate" className="mt-0.5" />
                  <div className="flex-1">
                    <Label htmlFor="validate" className="font-medium cursor-pointer">
                      {t('jobs.review.actions.requestChanges.title')}
                    </Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      {t('jobs.review.actions.requestChanges.description')}
                    </p>
                  </div>
                </div>

                <div
                  className={`flex items-start space-x-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                    action === 'reject'
                      ? 'border-destructive bg-destructive/5'
                      : 'hover:bg-accent/50'
                  }`}
                  onClick={() => setAction('reject')}
                >
                  <RadioGroupItem value="reject" id="reject" className="mt-0.5" />
                  <div className="flex-1">
                    <Label htmlFor="reject" className="font-medium cursor-pointer">
                      {t('jobs.review.actions.reject.title')}
                    </Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      {t('jobs.review.actions.reject.description')}
                    </p>
                  </div>
                </div>
              </div>
            </RadioGroup>
          </div>

          {/* Review Feedback */}
          <div>
            <Label htmlFor="feedback" className="text-sm font-semibold">
              {t('jobs.review.feedbackLabel', { required: action === 'validate' ? t('jobs.review.required') : t('jobs.review.optional') })}
            </Label>
            <p className="text-xs text-muted-foreground mb-2">
              {action === 'validate'
                ? t('jobs.review.feedbackPlaceholder.validate')
                : t('jobs.review.feedbackPlaceholder.other')}
            </p>
            <Editor
              editorSerializedState={editorState}
              onSerializedChange={setEditorState}
              placeholder={
                action === 'validate'
                  ? t('jobs.review.editorPlaceholder.validate')
                  : t('jobs.review.editorPlaceholder.other')
              }
              minHeight={150}
              disabled={isSubmitting}
            />
          </div>

          {/* Manager Review Score (only for accept) */}
          {action === 'accept' && (
            <div>
              <Label htmlFor="manager-review" className="text-sm font-semibold">
                {t('jobs.review.managerReviewLabel')}
              </Label>
              <p className="text-xs text-muted-foreground mb-2">
                {t('jobs.review.managerReviewDescription')}
              </p>
              <div className="space-y-3">
                <Slider
                  id="manager-review"
                  value={[managerReview]}
                  onValueChange={([value]) => setManagerReview(value)}
                  max={100}
                  step={1}
                  className="w-full"
                  disabled={isSubmitting}
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{t('jobs.review.scorePoor')}</span>
                  <span className="font-semibold text-foreground">{managerReview}/100</span>
                  <span>{t('jobs.review.scoreExcellent')}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex-shrink-0">
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isSubmitting}
          >
            {t('jobs.review.cancel')}
          </Button>
          <Button
            onClick={handleSubmitReview}
            disabled={isSubmitting || (action === 'validate' && isEditorEmpty(editorState))}
            variant={action === 'reject' ? 'destructive' : 'default'}
          >
            {isSubmitting
              ? t('jobs.review.submitting')
              : action === 'accept'
                ? t('jobs.review.acceptWork')
                : action === 'validate'
                  ? t('jobs.review.requestChangesButton')
                  : t('jobs.review.rejectWork')
            }
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
