'use client'

import React, { useState, useEffect, useContext } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useI18n } from '@/lib/contexts/i18n'
import { ViewMenu } from '@/components/viewMenu'
import { BalanceSection } from '@/components/balanceSection'
import { WalletManager } from '@/components/walletManager'
import { NFTGenerator } from '@/components/nftGenerator'
import { TokenTransfer } from '@/components/tokenTransfer'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { GlobalContext } from '@/lib/contexts'
import { useUserData } from '@/lib/userUtils'

export const InvestView = () => {
  const { t } = useI18n()
  const { session } = useContext(GlobalContext)
  const { refreshUser, isLoading } = useUserData()
  const [consentChecked, setConsentChecked] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  const user = session?.user as any
  const hasConsented = user?.consents?.doInvestDemo?.consentedOn != null
  const showModal = !isLoading && !hasConsented
  
  // Override Radix UI's pointer-events: none on body to allow bottom nav interaction
  useEffect(() => {
    if (showModal) {
      const originalPointerEvents = document.body.style.pointerEvents
      document.body.style.pointerEvents = 'auto'
      
      return () => {
        document.body.style.pointerEvents = originalPointerEvents
      }
    }
  }, [showModal])
  
  const handleConsent = async () => {
    if (!consentChecked) return
    
    setIsSubmitting(true)
    try {
      const consentQuestion = t('invest.consentCheckbox')
      const response = await fetch('/api/v1/user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          consents: {
            doInvestDemo: {
              consentedOn: new Date().toISOString(),
              consentQuestion,
            },
          },
        }),
      })
      
      if (response.ok) {
        await refreshUser()
      }
    } catch (error) {
      console.error('Error submitting consent:', error)
    } finally {
      setIsSubmitting(false)
    }
  }
  
  return (
    <main className="">
      <div className={`container mx-auto px-4 py-6 max-w-4xl space-y-6 ${!hasConsented ? 'blur-sm pointer-events-none' : ''}`}>
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
          <p className="text-sm text-destructive break-words">
            {t('invest.notice')}
          </p>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-4">
            <WalletManager />
          </div>
          <div className="space-y-4">
            <TokenTransfer />
            <NFTGenerator />
          </div>
        </div>
      </div>
      
      <AlertDialog open={showModal}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              {t('invest.consentTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-4 pt-2">
              <p className="text-sm text-destructive break-words">
                {t('invest.notice')}
              </p>
              <div className="flex items-start gap-3 pt-2">
                <Checkbox
                  id="consent-checkbox"
                  checked={consentChecked}
                  onCheckedChange={(checked) => setConsentChecked(checked === true)}
                  className="mt-0.5"
                />
                <label
                  htmlFor="consent-checkbox"
                  className="text-sm leading-relaxed cursor-pointer"
                >
                  {t('invest.consentCheckbox')}
                </label>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              onClick={handleConsent}
              disabled={!consentChecked || isSubmitting}
              className="w-full sm:w-auto"
            >
              {isSubmitting ? t('common.loading') : t('invest.confirm')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  )
}

