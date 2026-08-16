'use client'

import React, { useState, useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AttachmentPicker, attachmentFileUrl } from '@/components/attachmentPicker'
import type { PickedAttachment } from '@/components/attachmentPicker'
import { useI18n } from '@/lib/contexts/i18n'

export type JobDialogMode = 'request' | 'submit' | 'review' | 'requestReview'

interface JobDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: JobDialogMode
  taskName?: string
  isResubmit?: boolean
  isSubmitting?: boolean
  requestJob?: any
  /** The active job for submit/review modes (attachments link to it) */
  job?: any
  userId?: string
  onRequest: (justification: string, documentIds: string[]) => Promise<void> | void
  onSubmit: (data: { noteContent: string; selfReview: number; documentIds?: string[]; location?: any }) => Promise<void> | void
  onReview: (data: { action: 'accept' | 'validate' | 'reject'; reviewNoteContent?: string; managerReview?: number }) => Promise<void> | void
  onRequestReview?: (action: 'approve' | 'reject') => Promise<void> | void
}

/**
 * Unified job workflow dialog:
 * - request: collaborator justifies their request to work on a task (optionally attaching or reusing a CV)
 * - submit: worker posts evidence — note, self-review, and photo/video/document attachments
 * - review: owner/manager accepts, requests changes, or rejects
 * - requestReview: owner/manager reads a request's justification and approves/rejects
 */
export const JobDialog = ({
  open,
  onOpenChange,
  mode,
  taskName,
  isResubmit = false,
  isSubmitting = false,
  requestJob = null,
  job = null,
  userId,
  onRequest,
  onSubmit,
  onReview,
  onRequestReview,
}: JobDialogProps) => {
  const { t } = useI18n()

  const [justification, setJustification] = useState('')
  const [noteContent, setNoteContent] = useState('')
  const [selfReview, setSelfReview] = useState('5')
  const [managerReview, setManagerReview] = useState('5')
  const [reviewNoteContent, setReviewNoteContent] = useState('')
  const [pickedAttachments, setPickedAttachments] = useState<PickedAttachment[]>([])
  const [pickedEvidence, setPickedEvidence] = useState<PickedAttachment[]>([])
  const [previousCvs, setPreviousCvs] = useState<any[]>([])

  // Reset fields whenever the dialog (re)opens
  useEffect(() => {
    if (open) {
      setJustification('')
      setNoteContent('')
      setSelfReview('5')
      setManagerReview('5')
      setReviewNoteContent('')
      setPickedAttachments([])
      setPickedEvidence([])
      setPreviousCvs([])
      // Load the caller's previously stored CVs for the reuse picker
      if (mode === 'request') {
        fetch('/api/v1/attachments?kind=cv&mine=true')
          .then((res) => (res.ok ? res.json() : { documents: [] }))
          .then((data) => {
            if (Array.isArray(data?.documents)) setPreviousCvs(data.documents)
          })
          .catch(() => setPreviousCvs([]))
      }
    }
  }, [open, mode])

  const titles: Record<JobDialogMode, string> = {
    request: t('tasks.requestTitle', { defaultValue: 'Request to work' }),
    submit: isResubmit
      ? t('tasks.resubmitTitle', { defaultValue: 'Revise and resubmit' })
      : t('tasks.submitTitle', { defaultValue: 'Submit work' }),
    review: t('tasks.reviewTitle', { defaultValue: 'Review work' }),
    requestReview: t('tasks.requestReviewTitle', { defaultValue: 'Review request' }),
  }

  const descriptions: Record<JobDialogMode, string> = {
    request: t('tasks.requestDescription', { defaultValue: 'Explain why you want to take on this task. The list owner will review your request.' }),
    submit: t('tasks.submitDescription', { defaultValue: 'Post evidence of your work. A photo or video can be attached here soon.' }),
    review: t('tasks.reviewDescription', { defaultValue: 'Accept the work, request changes, or reject it.' }),
    requestReview: t('tasks.requestReviewDescription', { defaultValue: 'Review the request and decide whether to let this user work on the task.' }),
  }

  // A picked CV counts as "uploading" until the picker commits it (documentId set)
  const isUploadingCv = pickedAttachments.some((a) => a.documentId == null)
  // Evidence attachments are uploading until the picker commits them
  const isUploadingEvidence = pickedEvidence.some((a) => a.documentId == null)

  // Reuse a previously stored CV: it already has a documentId, so it is submit-ready
  const handleReuseCv = (docId: string) => {
    const doc = previousCvs.find((d: any) => d.id === docId)
    if (!doc) return
    setPickedAttachments([
      {
        key: doc.id,
        publicUrl: attachmentFileUrl(doc.id),
        fileName: doc.fileName,
        mimeType: doc.mimeType || 'application/pdf',
        kind: 'cv',
        size: doc.fileSize ?? 0,
        documentId: doc.id,
      },
    ])
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[480px] max-w-[90vw] max-h-[70vh] z-[9980] flex flex-col">
        <DialogHeader>
          <DialogTitle>{titles[mode]}{taskName ? ` — ${taskName}` : ''}</DialogTitle>
          <DialogDescription>{descriptions[mode]}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 overflow-y-auto flex-1 pr-1">
          {mode === 'request' && (
            <>
              <div>
                <Label htmlFor="job-justification">{t('tasks.justificationLabel', { defaultValue: 'Justification' })}</Label>
                <Textarea
                  id="job-justification"
                  value={justification}
                  onChange={(e) => setJustification(e.target.value)}
                  placeholder={t('tasks.justificationPlaceholder', { defaultValue: 'Why should you do this task?' })}
                />
              </div>
              {userId && (
                <div className="space-y-2">
                  <Label>{t('tasks.cv.label', { defaultValue: 'CV (optional)' })}</Label>
                  <AttachmentPicker
                    entityType="user"
                    entityId={userId}
                    kind="cv"
                    role="cv"
                    max={1}
                    accept=".pdf"
                    value={pickedAttachments}
                    onChange={setPickedAttachments}
                  />
                  {previousCvs.length > 0 && (
                    <div>
                      <Label>{t('tasks.cv.reuseLabel', { defaultValue: 'Your CVs' })}</Label>
                      <Select value="" onValueChange={handleReuseCv}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder={t('tasks.cv.reusePlaceholder', { defaultValue: 'Reuse a previous CV...' })} />
                        </SelectTrigger>
                        <SelectContent>
                          {previousCvs.map((doc: any) => (
                            <SelectItem key={doc.id} value={doc.id}>
                              {doc.fileName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {mode === 'submit' && (
            <>
              <div>
                <Label htmlFor="job-note">{t('tasks.evidenceLabel', { defaultValue: 'Evidence / note' })}</Label>
                <Textarea
                  id="job-note"
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  placeholder={t('tasks.evidencePlaceholder', { defaultValue: 'Describe what you did...' })}
                />
              </div>
              <div>
                <Label htmlFor="job-self-review">{t('tasks.selfReviewLabel', { defaultValue: 'Self-review (0-100)' })}</Label>
                <Input
                  id="job-self-review"
                  type="number"
                  min={0}
                  max={100}
                  value={selfReview}
                  onChange={(e) => setSelfReview(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('tasks.evidenceAttachmentsLabel', { defaultValue: 'Evidence attachments (photos, videos, documents)' })}</Label>
                {job?.id ? (
                  <AttachmentPicker
                    entityType="job"
                    entityId={job.id}
                    role="evidence"
                    kind="any"
                    max={4}
                    value={pickedEvidence}
                    onChange={setPickedEvidence}
                  />
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {t('tasks.evidenceAttachmentsUnavailable', { defaultValue: 'Attachments are available once the job exists.' })}
                  </p>
                )}
              </div>
            </>
          )}

          {mode === 'review' && (
            <>
              <div>
                <Label htmlFor="job-manager-review">{t('tasks.managerReviewLabel', { defaultValue: 'Review score (0-100)' })}</Label>
                <Input
                  id="job-manager-review"
                  type="number"
                  min={0}
                  max={100}
                  value={managerReview}
                  onChange={(e) => setManagerReview(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="job-review-note">{t('tasks.reviewNoteLabel', { defaultValue: 'Feedback (optional)' })}</Label>
                <Textarea
                  id="job-review-note"
                  value={reviewNoteContent}
                  onChange={(e) => setReviewNoteContent(e.target.value)}
                />
              </div>
            </>
          )}

          {mode === 'requestReview' && requestJob && (
            <>
              <div className="text-sm">
                <span className="text-muted-foreground">{t('tasks.requestedBy', { defaultValue: 'Requested by' })} </span>
                <span className="font-medium">@{requestJob.worker?.profiles?.[0]?.username || t('tasks.unknownWorker', { defaultValue: 'Unknown' })}</span>
                {requestJob.occurrenceDate && (
                  <span className="text-muted-foreground"> · {requestJob.occurrenceDate}</span>
                )}
              </div>
              <div>
                <Label>{t('tasks.justificationLabel', { defaultValue: 'Justification' })}</Label>
                <div className="mt-1 p-3 bg-muted rounded-md">
                  <p className="text-sm whitespace-pre-wrap break-words">
                    {requestJob.justification || t('tasks.noJustification', { defaultValue: 'No justification provided.' })}
                  </p>
                </div>
              </div>
              {Array.isArray(requestJob.documentIds) && requestJob.documentIds.length > 0 && (
                <div>
                  <Label>{t('tasks.cv.attachedDocuments', { defaultValue: 'Attached documents' })}</Label>
                  <div className="mt-1 space-y-1">
                    {requestJob.documentIds.map((id: string, index: number) => (
                      <a
                        key={id}
                        href={attachmentFileUrl(id)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block text-sm text-primary underline underline-offset-2 hover:no-underline"
                      >
                        {t('tasks.cv.viewDocument', { defaultValue: 'View document' })} {index + 1}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex gap-2 pt-2 flex-wrap">
          {mode === 'request' && (
            <>
              <Button
                disabled={!justification.trim() || isSubmitting || isUploadingCv}
                onClick={async () => {
                  await onRequest(
                    justification.trim(),
                    pickedAttachments.map((a) => a.documentId).filter((id): id is string => Boolean(id))
                  )
                  onOpenChange(false)
                }}
              >
                {t('tasks.sendRequest', { defaultValue: 'Send request' })}
              </Button>
              {isUploadingCv && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground self-center">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  {t('tasks.cv.uploading', { defaultValue: 'Uploading attachment...' })}
                </span>
              )}
            </>
          )}

          {mode === 'submit' && (
            <>
              <Button
                disabled={!noteContent.trim() || isSubmitting || isUploadingEvidence}
                onClick={async () => {
                  await onSubmit({
                    noteContent: noteContent.trim(),
                    selfReview: Math.max(0, Math.min(100, Number(selfReview) || 0)),
                    documentIds: pickedEvidence
                      .map((a) => a.documentId)
                      .filter((id): id is string => Boolean(id)),
                    location: pickedEvidence.find((a) => a.location)?.location ?? undefined,
                  })
                  onOpenChange(false)
                }}
              >
                {isResubmit
                  ? t('tasks.resubmit', { defaultValue: 'Resubmit' })
                  : t('tasks.submit', { defaultValue: 'Submit' })}
              </Button>
              {isUploadingEvidence && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground self-center">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  {t('tasks.cv.uploading', { defaultValue: 'Uploading attachment...' })}
                </span>
              )}
            </>
          )}

          {mode === 'review' && (
            <>
              <Button
                disabled={isSubmitting}
                onClick={async () => {
                  await onReview({ action: 'accept', reviewNoteContent: reviewNoteContent.trim() || undefined, managerReview: Math.max(0, Math.min(100, Number(managerReview) || 0)) })
                  onOpenChange(false)
                }}
              >
                {t('tasks.accept', { defaultValue: 'Accept' })}
              </Button>
              <Button
                variant="outline"
                disabled={isSubmitting}
                onClick={async () => {
                  await onReview({ action: 'validate', reviewNoteContent: reviewNoteContent.trim() || undefined })
                  onOpenChange(false)
                }}
              >
                {t('tasks.requestChanges', { defaultValue: 'Request changes' })}
              </Button>
              <Button
                variant="destructive"
                disabled={isSubmitting}
                onClick={async () => {
                  await onReview({ action: 'reject', reviewNoteContent: reviewNoteContent.trim() || undefined })
                  onOpenChange(false)
                }}
              >
                {t('tasks.reject', { defaultValue: 'Reject' })}
              </Button>
            </>
          )}

          {mode === 'requestReview' && (
            <>
              <Button
                disabled={isSubmitting}
                onClick={async () => {
                  if (onRequestReview) await onRequestReview('approve')
                  onOpenChange(false)
                }}
              >
                {t('jobs.actions.approveRequest', { defaultValue: 'Approve request' })}
              </Button>
              <Button
                variant="destructive"
                disabled={isSubmitting}
                onClick={async () => {
                  if (onRequestReview) await onRequestReview('reject')
                  onOpenChange(false)
                }}
              >
                {t('jobs.actions.rejectRequest', { defaultValue: 'Reject request' })}
              </Button>
            </>
          )}

          <Button variant="ghost" disabled={isSubmitting} onClick={() => onOpenChange(false)}>
            {t('forms.addTaskForm.cancel', { defaultValue: 'Cancel' })}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
