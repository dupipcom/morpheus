'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Phone } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { useI18n } from '@/lib/contexts/i18n'
import { useFeatureFlag } from '@/lib/hooks/useFeatureFlag'

/**
 * Virtual number purchase gate for the chat sidebar. Rendered instead of the
 * picker for users without the `virtual_number` premium feature — explains
 * that a Donator plan is required and links to the Clerk pricing page.
 */
export function VirtualNumberGate() {
  const { t, locale } = useI18n()
  const { isVirtualNumberEnabled } = useFeatureFlag()
  const router = useRouter()
  const [open, setOpen] = useState(false)

  if (isVirtualNumberEnabled) return null

  return (
    <Card>
      <CardHeader className="space-y-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Phone className="h-4 w-4" />
          {t('chat.virtualNumber.label')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">{t('chat.virtualNumber.gateHint')}</p>
        <Button size="sm" className="w-full" onClick={() => setOpen(true)}>
          {t('chat.virtualNumber.buyCta')}
        </Button>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('chat.virtualNumber.buyDialogTitle')}</DialogTitle>
              <DialogDescription>{t('chat.virtualNumber.buyDialogDescription')}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button onClick={() => router.push(`/${locale}/pricing`)}>
                {t('chat.virtualNumber.buyDialogGoToPricing')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  )
}
