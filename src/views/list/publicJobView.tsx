'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useI18n } from '@/lib/contexts/i18n'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Check } from 'lucide-react'

/**
 * Single job post page body (server shell + client apply island).
 * The apply action posts to /api/v1/tasks/[taskId]/apply; 409 shows as an
 * already-applied state, 400/404 surfaces the server's message.
 */
export function PublicJobView({
  task,
  taskList,
  locale
}: {
  task: any
  taskList: any
  locale: string
}) {
  const { t } = useI18n()

  const [applyOpen, setApplyOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [applied, setApplied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submitApply = async () => {
    if (isSubmitting) return
    setIsSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/v1/tasks/${task.id}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: message.trim() || null })
      })
      if (res.ok) {
        setApplied(true)
        setApplyOpen(false)
      } else {
        const data = await res.json().catch(() => null)
        setError(
          data?.error ||
            t('list.public.applyError', { defaultValue: 'Could not apply. Try again.' })
        )
      }
    } catch (submitError) {
      console.error('Error applying:', submitError)
      setError(t('list.public.applyError', { defaultValue: 'Could not apply. Try again.' }))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="container mx-auto max-w-3xl px-4 py-6 space-y-4">
      <Link href={`/${locale}/list/${taskList.publicUrl}`} className="text-sm text-primary hover:underline">
        ← {taskList.name}
      </Link>

      <Card>
        <CardContent className="pt-4 space-y-3">
          <h1 className="text-2xl font-bold">{task.name}</h1>

          {task.jobDescription && (
            <p className="text-sm whitespace-pre-line">{task.jobDescription}</p>
          )}

          {task.requirements && (
            <div>
              <h2 className="font-semibold mb-1">
                {t('list.public.requirements', { defaultValue: 'Requirements' })}
              </h2>
              <p className="text-sm whitespace-pre-line">{task.requirements}</p>
            </div>
          )}

          <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
            {task.area && <span>{task.area}</span>}
            {(task.categories || []).map((c: string) => (
              <span key={c}>{c}</span>
            ))}
            {task.applyBy && (
              <span>
                {t('list.public.applyBy', { defaultValue: 'Apply by' })} {task.applyBy}
              </span>
            )}
            {task.openings != null && (
              <span>
                {t('list.public.openings', { defaultValue: 'Openings' })}: {task.openings}
              </span>
            )}
          </div>

          {taskList.viewer?.hasApplied || applied ? (
            <Button disabled>
              <Check className="h-4 w-4 mr-1" />
              {t('list.public.applied', { defaultValue: 'Applied' })}
            </Button>
          ) : (
            <Button onClick={() => setApplyOpen(true)}>
              {t('list.public.apply', { defaultValue: 'Apply' })}
            </Button>
          )}
        </CardContent>
      </Card>

      <Dialog open={applyOpen} onOpenChange={setApplyOpen}>
        <DialogContent className="w-[480px] max-w-[90vw] max-h-[70vh] z-[9980] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {t('list.public.applyTo', { defaultValue: 'Apply to' })} {task.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="apply-message">
                {t('list.public.applyMessage', { defaultValue: 'Message (optional)' })}
              </Label>
              <textarea
                id="apply-message"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm min-h-[100px]"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={t('list.public.applyMessagePlaceholder', {
                  defaultValue: 'Tell the owner why you are a fit...'
                })}
              />
            </div>
            {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
            <div className="flex gap-2">
              <Button onClick={submitApply} disabled={isSubmitting}>
                {t('list.public.submitApply', { defaultValue: 'Submit application' })}
              </Button>
              <Button variant="outline" onClick={() => setApplyOpen(false)}>
                {t('list.public.cancel', { defaultValue: 'Cancel' })}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  )
}
