'use client'

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import { Phone } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useI18n } from '@/lib/contexts/i18n'
import { useFeatureFlag } from '@/lib/hooks/useFeatureFlag'
import { jsonFetcher } from '@/lib/utils/utils'

interface AssignmentResponse {
  assignment: { phoneNumber: string; provider: string; createdAt: string; updatedAt: string } | null
}

interface NumbersResponse {
  numbers: { id: string; phoneNumber: string; friendlyName: string | null }[]
}

const ASSIGNMENT_KEY = '/api/v1/virtual-number'
const NUMBERS_KEY = '/api/v1/virtual-number/numbers'
const NONE_VALUE = 'none'

/**
 * Premium-gated Telnyx virtual number picker (Clerk feature `virtual_number`).
 * Rendered in the chat sidebar; lets the user associate one of the Telnyx
 * account's available numbers with their Dupip account. Incoming SMS to that
 * number will later appear in chat.
 */
export function VirtualNumberPicker() {
  const { t } = useI18n()
  const { isVirtualNumberEnabled } = useFeatureFlag()
  const [isSaving, setIsSaving] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)

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

  const currentPhoneNumber = assignmentData?.assignment?.phoneNumber ?? null

  // The current number is assigned, so /numbers excludes it — append it so the
  // Select value always matches an item (Radix renders nothing otherwise).
  const optionNumbers = useMemo(() => {
    const list = numbersData?.numbers ?? []
    if (currentPhoneNumber && !list.some((number) => number.phoneNumber === currentPhoneNumber)) {
      return [...list, { id: 'current', phoneNumber: currentPhoneNumber, friendlyName: null }]
    }
    return list
  }, [numbersData, currentPhoneNumber])

  const save = async (phoneNumber: string | null) => {
    setIsSaving(true)
    setFeedback(null)
    try {
      const response = await fetch(ASSIGNMENT_KEY, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber })
      })
      const payload = await response.json().catch(() => ({ error: 'Request failed' }))
      if (!response.ok) throw new Error(payload.error || 'Request failed')

      await Promise.all([mutateAssignment(), mutateNumbers()])
      setFeedback(phoneNumber ? t('chat.virtualNumber.assigned') : t('chat.virtualNumber.cleared'))
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : t('chat.virtualNumber.assignError'))
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
        <Select
          value={currentPhoneNumber ?? NONE_VALUE}
          onValueChange={(value) => void save(value === NONE_VALUE ? null : value)}
          disabled={isSaving || isLoading || Boolean(error)}
        >
          <SelectTrigger className="w-full" aria-label={t('chat.virtualNumber.label')}>
            <SelectValue placeholder={t('chat.virtualNumber.none')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE_VALUE}>{t('chat.virtualNumber.none')}</SelectItem>
            {optionNumbers.map((number) => (
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
        {!isLoading && !error && optionNumbers.length === 0 && (
          <p className="text-xs text-muted-foreground">{t('chat.virtualNumber.empty')}</p>
        )}
        {feedback && <p className="text-xs text-muted-foreground">{feedback}</p>}
      </CardContent>
    </Card>
  )
}
