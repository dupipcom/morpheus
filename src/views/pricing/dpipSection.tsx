'use client'

import { AlertTriangle, CheckCircle2, Coins } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useI18n } from '@/lib/contexts/i18n'

interface DpipSectionProps {
  isLoaded: boolean
  isSignedIn: boolean
  consentedOn?: string
}

/**
 * Informational DPIP card. All consent interaction happens in the dialog
 * owned by PricingView; this card tells the story and shows the status.
 */
export function DpipSection({ isLoaded, isSignedIn, consentedOn }: DpipSectionProps) {
  const { t, formatDate } = useI18n()

  return (
    <section className="max-w-3xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Coins className="h-5 w-5" />
            {t('pricing.dpipTitle')}
          </CardTitle>
          <CardDescription>{t('pricing.dpipBody')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
            <p className="text-sm text-destructive break-words">{t('pricing.dpipNoValue')}</p>
          </div>

          {isLoaded && !isSignedIn && (
            <p className="text-sm text-muted-foreground">{t('pricing.consentSignedOut')}</p>
          )}
          {isLoaded && isSignedIn && consentedOn != null && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              {t('pricing.consentSaved', { date: formatDate(new Date(consentedOn)) })}
            </p>
          )}
        </CardContent>
      </Card>
    </section>
  )
}
