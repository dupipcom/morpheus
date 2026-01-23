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
import { Editor, lexicalToHtml, isEditorEmpty, createEmptyState } from '@/components/editor'
import { toast } from 'sonner'
import { useI18n } from '@/lib/contexts/i18n'

interface JobSubmissionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  jobId: string
  taskName: string
  isResubmit?: boolean
  previousNotes?: string
  onSubmit: (data: { noteContent: string; selfReview: number }) => Promise<void>
}

export function JobSubmissionDialog({
  open,
  onOpenChange,
  jobId,
  taskName,
  isResubmit = false,
  previousNotes = '',
  onSubmit,
}: JobSubmissionDialogProps) {
  const { t } = useI18n()
  const initialEditorState = useMemo(() => createEmptyState(), [])
  const [editorState, setEditorState] = useState<SerializedEditorState>(initialEditorState)
  const [selfReview, setSelfReview] = useState(80)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (isEditorEmpty(editorState)) {
      toast.error(t('jobs.submission.errors.missingDescription'))
      return
    }

    setIsSubmitting(true)
    try {
      // Convert Lexical state to HTML for storage
      const noteContent = lexicalToHtml(editorState)
      await onSubmit({ noteContent, selfReview })
      toast.success(isResubmit ? t('jobs.submission.messages.resubmitted') : t('jobs.submission.messages.submitted'))
      onOpenChange(false)
      setEditorState(createEmptyState())
      setSelfReview(80)
    } catch (error) {
      toast.error(t('jobs.submission.errors.submitError'))
      console.error('Error submitting work:', error)
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
        setSelfReview(80)
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col z-[9999]">
        <DialogHeader>
          <DialogTitle>
            {isResubmit ? t('jobs.submission.titleResubmit') : t('jobs.submission.title')}
          </DialogTitle>
          <DialogDescription>
            {t('jobs.submission.description', { taskName })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4 overflow-y-auto flex-1">
          {/* Solution Description */}
          <div>
            <Label htmlFor="solution" className="text-sm font-semibold">
              {t('jobs.submission.solutionLabel')}
            </Label>
            <p className="text-xs text-muted-foreground mb-2">
              {t('jobs.submission.solutionDescription')}
            </p>
            <Editor
              editorSerializedState={editorState}
              onSerializedChange={setEditorState}
              placeholder={t('jobs.submission.solutionPlaceholder')}
              minHeight={200}
              disabled={isSubmitting}
            />
          </div>

          {/* Self-Review Slider */}
          <div>
            <Label htmlFor="self-review" className="text-sm font-semibold">
              {t('jobs.submission.selfReviewLabel')}
            </Label>
            <p className="text-xs text-muted-foreground mb-2">
              {t('jobs.submission.selfReviewDescription')}
            </p>
            <div className="space-y-3">
              <Slider
                id="self-review"
                value={[selfReview]}
                onValueChange={([value]) => setSelfReview(value)}
                max={100}
                step={1}
                className="w-full"
                disabled={isSubmitting}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{t('jobs.submission.scoreNeedsWork')}</span>
                <span className="font-semibold text-foreground">{selfReview}/100</span>
                <span>{t('jobs.submission.scorePerfect')}</span>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-shrink-0">
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isSubmitting}
          >
            {t('jobs.submission.cancel')}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isEditorEmpty(editorState) || isSubmitting}
          >
            {isSubmitting
              ? t('jobs.submission.submitting')
              : isResubmit
                ? t('jobs.submission.resubmitButton')
                : t('jobs.submission.submitButton')
            }
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
