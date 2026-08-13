'use client'

import { useContext, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { PricingTable, SignInButton } from '@clerk/nextjs'
import { useAuth } from '@clerk/clerk-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useI18n } from '@/lib/contexts/i18n'
import { GlobalContext } from '@/lib/contexts'
import { useUserData } from '@/lib/utils/userUtils'
import { DpipSection } from './dpipSection'

interface UserConsents {
  consents?: {
    dpipNoMonetaryValue?: {
      consentedOn?: string
    }
  }
}

/**
 * Public pricing feature.
 *
 * Plan names, tiers, monthly/yearly values and features come from the Clerk
 * dashboard — there is no plan catalog mirrored in code. The plans grid is
 * gated behind an explicit DPIP consent: users must save the consent before
 * the table is unblurred. Signed-out visitors are asked to sign in first.
 */
export function PricingView() {
  const { t, locale } = useI18n()
  const { isLoaded, isSignedIn } = useAuth()
  const { session } = useContext(GlobalContext)
  const { refreshUser } = useUserData(isLoaded && !!isSignedIn)
  const [consentChecked, setConsentChecked] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const consentedOn = (session?.user as UserConsents | undefined)?.consents?.dpipNoMonetaryValue?.consentedOn
  const hasConsented = consentedOn != null
  // The user doc loads async after the Clerk session; treat as loading until present
  const sessionReady = !!session?.user?.userId
  const gated = isLoaded && (isSignedIn ? (sessionReady && !hasConsented) : true)
  const blocked = !isLoaded || (isSignedIn && !sessionReady) || gated

  const handleConsent = async () => {
    if (!consentChecked || !isSignedIn) return

    setIsSubmitting(true)
    try {
      const response = await fetch('/api/v1/user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          consents: {
            dpipNoMonetaryValue: {
              consentedOn: new Date().toISOString(),
              consentQuestion: t('pricing.consentCheckbox'),
            },
          },
        }),
      })

      if (response.ok) {
        await refreshUser()
      }
    } catch (error) {
      console.error('Error submitting DPIP consent:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <section id="plans" className="space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-semibold">{t('pricing.plansTitle')}</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">{t('pricing.plansDescription')}</p>
        </div>
        <div
          className={blocked ? 'blur-sm pointer-events-none select-none' : undefined}
          aria-hidden={blocked}
        >
          <PricingTable
            for="user"
            ctaPosition="bottom"
            newSubscriptionRedirectUrl={`/${locale}/app/profile`}
          />
        </div>
      </section>

      <DpipSection isLoaded={isLoaded} isSignedIn={isSignedIn} consentedOn={consentedOn} />

      <AlertDialog open={gated} onOpenChange={() => {}}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              {t('pricing.consentTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-4 pt-2">
              {isSignedIn ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    {t('pricing.consentDescription')}
                  </p>
                  <p className="text-sm text-destructive break-words">
                    {t('pricing.dpipNoValue')}
                  </p>
                  <div className="flex items-start gap-3 pt-2">
                    <Checkbox
                      id="dpip-consent-checkbox"
                      checked={consentChecked}
                      onCheckedChange={(checked) => setConsentChecked(checked === true)}
                      className="mt-0.5"
                    />
                    <label
                      htmlFor="dpip-consent-checkbox"
                      className="text-sm leading-relaxed cursor-pointer"
                    >
                      {t('pricing.consentCheckbox')}
                    </label>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t('pricing.consentSignedOut')}
                </p>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            {isSignedIn ? (
              <Button
                onClick={handleConsent}
                disabled={!consentChecked || isSubmitting}
                className="w-full sm:w-auto"
              >
                {isSubmitting ? t('common.loading') : t('pricing.saveConsent')}
              </Button>
            ) : (
              <SignInButton signInFallbackRedirectUrl={`/${locale}/pricing`}>
                <Button className="w-full sm:w-auto">{t('pricing.signInToConsent')}</Button>
              </SignInButton>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
