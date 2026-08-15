'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { Phone, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useI18n } from '@/lib/contexts/i18n'
import { useFeatureFlag } from '@/lib/hooks/useFeatureFlag'
import { jsonFetcher } from '@/lib/utils/utils'

interface AssignmentResponse {
  assignments: { phoneNumber: string; provider: string; createdAt: string; updatedAt: string }[]
  quota: number
}

interface NumbersResponse {
  numbers: { id: string; phoneNumber: string; friendlyName: string | null }[]
}

const ASSIGNMENT_KEY = '/api/v1/virtual-number'
const NUMBERS_KEY = '/api/v1/virtual-number/numbers'
const NONE_VALUE = 'none'

/**
 * Premium-gated Telnyx virtual number picker (Clerk feature `virtual_number`).
 * Rendered in the chat sidebar; lets the user assign several of the Telnyx
 * account's available numbers to their Dupip account, up to their plan quota.
 * Incoming SMS to those numbers will later appear in chat.
 */
export function VirtualNumberPicker() {
  const { t } = useI18n()
  const { isVirtualNumberEnabled } = useFeatureFlag()
  const [isSaving, setIsSaving] = useState(false)

  const { data: assignmentData, mutate: mutateAssignment } = useSWR<AssignmentResponse>(
    isVirtualNumberEnabled ? ASSIGNMENT_KEY : null,
    jsonFetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      shouldRetryOnError: false
    }
  )

  const { data: numbersData, error, isLoading, mutate: mutateNumbers } = useSWR<NumbersResponse>(
    isVirtualNumberEnabled ? NUMBERS_KEY : null,
    jsonFetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      shouldRetryOnError: false,
      dedupingInterval: 10000 // Telnyx call on every remount is expensive
    }
  )

  const assignments = assignmentData?.assignments ?? []
  const quota = assignmentData?.quota ?? 0
  const atQuota = quota > 0 && assignments.length >= quota

  const refresh = async () => {
    await Promise.all([mutateAssignment(), mutateNumbers()])
  }

  const add = async (phoneNumber: string) => {
    setIsSaving(true)
    try {
      const response = await fetch(ASSIGNMENT_KEY, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber })
      })
      const payload = await response.json().catch(() => ({ error: 'Request failed' }))
      if (!response.ok) throw new Error(payload.error || 'Request failed')

      await refresh()
      toast.success(t('chat.virtualNumber.assigned'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('chat.virtualNumber.assignError'))
    } finally {
      setIsSaving(false)
    }
  }

  const remove = async (phoneNumber: string) => {
    setIsSaving(true)
    try {
      const response = await fetch(
        `${ASSIGNMENT_KEY}?phoneNumber=${encodeURIComponent(phoneNumber)}`,
        { method: 'DELETE' }
      )
      const payload = await response.json().catch(() => ({ error: 'Request failed' }))
      if (!response.ok) throw new Error(payload.error || 'Request failed')

      await refresh()
      toast.success(t('chat.virtualNumber.cleared'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('chat.virtualNumber.assignError'))
    } finally {
      setIsSaving(false)
    }
  }

  if (!isVirtualNumberEnabled) return null

  return (
    <Card>
      <CardHeader className="space-y-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Phone className="h-4 w-4" />
          {t('chat.virtualNumber.label')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-xs text-muted-foreground">{t('chat.virtualNumber.hint')}</p>

        {quota > 0 && (
          <p className="text-xs text-muted-foreground">
            {t('chat.virtualNumber.quotaLabel', { used: assignments.length, quota })}
          </p>
        )}

        {assignments.length > 0 && (
          <ul className="space-y-1">
            {assignments.map((assignment) => (
              <li
                key={assignment.phoneNumber}
                className="flex items-center justify-between rounded-lg border px-3 py-1.5 text-sm"
              >
                <span>{assignment.phoneNumber}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  aria-label={t('chat.virtualNumber.removeNumber')}
                  disabled={isSaving}
                  onClick={() => void remove(assignment.phoneNumber)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <Select
          value={NONE_VALUE}
          onValueChange={(value) => {
            if (value !== NONE_VALUE) void add(value)
          }}
          disabled={isSaving || isLoading || Boolean(error) || atQuota}
        >
          <SelectTrigger className="w-full" aria-label={t('chat.virtualNumber.label')}>
            <SelectValue placeholder={t('chat.virtualNumber.addNumber')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE_VALUE}>{t('chat.virtualNumber.addNumber')}</SelectItem>
            {(numbersData?.numbers ?? []).map((number) => (
              <SelectItem key={number.id} value={number.phoneNumber}>
                {number.friendlyName
                  ? `${number.friendlyName} (${number.phoneNumber})`
                  : number.phoneNumber}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {isLoading && <p className="text-xs text-muted-foreground">{t('chat.virtualNumber.loading')}</p>}
        {error && <p className="text-xs text-destructive">{t('chat.virtualNumber.error')}</p>}
        {!isLoading && !error && (numbersData?.numbers ?? []).length === 0 && (
          <p className="text-xs text-muted-foreground">{t('chat.virtualNumber.empty')}</p>
        )}
        {atQuota && <p className="text-xs text-muted-foreground">{t('chat.virtualNumber.limitReached')}</p>}
      </CardContent>
    </Card>
  )
}
