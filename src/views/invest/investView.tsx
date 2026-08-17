'use client'

import React, { useState, useEffect, useContext, useCallback } from 'react'
import { AlertTriangle } from 'lucide-react'

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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { WalletManager } from '@/components/walletManager'
import { NFTGenerator } from '@/components/nftGenerator'
import { TokenTransfer } from '@/components/tokenTransfer'
import { WalletBalanceCard } from '@/components/walletBalanceCard'
import { useI18n } from '@/lib/contexts/i18n'
import { GlobalContext } from '@/lib/contexts'
import { useUserData, useWallets } from '@/lib/utils/userUtils'
import {
  DEFAULT_DAILY_PREMIUM_FACTOR,
  DEFAULT_WEEKLY_PREMIUM_FACTOR,
  DEFAULT_GLOBAL_PREMIUM_FACTOR,
  MIN_PREMIUM_FACTOR
} from '@/lib/utils/earningsUtils'

export function InvestView(): React.ReactElement {
  const { t } = useI18n()
  const { session } = useContext(GlobalContext)
  const { refreshUser, isLoading } = useUserData()
  const { wallets } = useWallets()
  const defaultWalletId =
    wallets?.find((w: { isDefault?: boolean }) => w.isDefault)?.id ?? wallets?.[0]?.id
  const [consentChecked, setConsentChecked] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  // Premium factor states
  const [dailyPremiumFactor, setDailyPremiumFactor] = useState<number>(DEFAULT_DAILY_PREMIUM_FACTOR)
  const [weeklyPremiumFactor, setWeeklyPremiumFactor] = useState<number>(DEFAULT_WEEKLY_PREMIUM_FACTOR)
  const [globalPremiumFactor, setGlobalPremiumFactor] = useState<number>(DEFAULT_GLOBAL_PREMIUM_FACTOR)
  const [isSavingFactors, setIsSavingFactors] = useState(false)

  const user = session?.user as any
  const isLoggedIn = !!session?.user.userId
  const hasConsented = user?.consents?.doInvestDemo?.consentedOn != null
  const showModal = isLoggedIn && !isLoading && !hasConsented
  
  // Initialize premium factors from user settings
  useEffect(() => {
    if (user?.settings) {
      setDailyPremiumFactor(user.settings.dailyPremiumFactor ?? DEFAULT_DAILY_PREMIUM_FACTOR)
      setWeeklyPremiumFactor(user.settings.weeklyPremiumFactor ?? DEFAULT_WEEKLY_PREMIUM_FACTOR)
      setGlobalPremiumFactor(user.settings.globalPremiumFactor ?? DEFAULT_GLOBAL_PREMIUM_FACTOR)
    }
  }, [user?.settings])
  
  // The consent AlertDialog leaves pointer-events: none on <body> while open;
  // the bottom nav stays interactive through the .bottom-nav-interactive
  // class, and ModalSurfaceGuard restores <body> when the dialog closes.

  // Save premium factors to user settings
  const savePremiumFactors = useCallback(async () => {
    setIsSavingFactors(true)
    try {
      const response = await fetch('/api/v1/user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          settings: {
            dailyPremiumFactor: Math.max(MIN_PREMIUM_FACTOR, dailyPremiumFactor),
            weeklyPremiumFactor: Math.max(MIN_PREMIUM_FACTOR, weeklyPremiumFactor),
            globalPremiumFactor: Math.max(MIN_PREMIUM_FACTOR, globalPremiumFactor),
          },
        }),
      })
      
      if (response.ok) {
        await refreshUser()
      }
    } catch (error) {
      console.error('Error saving premium factors:', error)
    } finally {
      setIsSavingFactors(false)
    }
  }, [dailyPremiumFactor, weeklyPremiumFactor, globalPremiumFactor, refreshUser])
  
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
  
  // Handle number input change with minimum enforcement
  const handleFactorChange = (
    value: string,
    setter: React.Dispatch<React.SetStateAction<number>>
  ) => {
    const parsed = parseInt(value, 10)
    if (!isNaN(parsed)) {
      setter(Math.max(MIN_PREMIUM_FACTOR, parsed))
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
        
        {/* Premium Factors Card */}
        <Card>
          <CardHeader>
            <CardTitle>{t('invest.premiumFactors') || 'Premium Factors'}</CardTitle>
            <CardDescription>
              {t('invest.premiumFactorsDescription') || 'Adjust how premium values are divided based on list cadence.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="dailyPremiumFactor">
                  {t('invest.dailyPremiumFactor') || 'Daily Premium Factor'}
                </Label>
                <Input
                  id="dailyPremiumFactor"
                  type="number"
                  min={MIN_PREMIUM_FACTOR}
                  value={dailyPremiumFactor}
                  onChange={(e) => handleFactorChange(e.target.value, setDailyPremiumFactor)}
                />
                <p className="text-xs text-muted-foreground">
                  {t('invest.dailyPremiumFactorDescription') || 'Divides premium for daily lists (default: 30)'}
                </p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="weeklyPremiumFactor">
                  {t('invest.weeklyPremiumFactor') || 'Weekly Premium Factor'}
                </Label>
                <Input
                  id="weeklyPremiumFactor"
                  type="number"
                  min={MIN_PREMIUM_FACTOR}
                  value={weeklyPremiumFactor}
                  onChange={(e) => handleFactorChange(e.target.value, setWeeklyPremiumFactor)}
                />
                <p className="text-xs text-muted-foreground">
                  {t('invest.weeklyPremiumFactorDescription') || 'Divides premium for weekly lists (default: 4)'}
                </p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="globalPremiumFactor">
                  {t('invest.globalPremiumFactor') || 'Global Premium Factor'}
                </Label>
                <Input
                  id="globalPremiumFactor"
                  type="number"
                  min={MIN_PREMIUM_FACTOR}
                  value={globalPremiumFactor}
                  onChange={(e) => handleFactorChange(e.target.value, setGlobalPremiumFactor)}
                />
                <p className="text-xs text-muted-foreground">
                  {t('invest.globalPremiumFactorDescription') || 'Divides premium in all scenarios (default: 1)'}
                </p>
              </div>
            </div>
            
            <Button
              onClick={savePremiumFactors}
              disabled={isSavingFactors}
              className="w-full sm:w-auto"
            >
              {isSavingFactors ? t('common.loading') : t('common.save') || 'Save'}
            </Button>
          </CardContent>
        </Card>
        
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-4">
            <WalletManager />
          </div>
          <div className="space-y-4">
            <TokenTransfer />
            {defaultWalletId && <WalletBalanceCard walletId={defaultWalletId} />}
            <NFTGenerator />
          </div>
        </div>
      </div>
      
      {showModal && <AlertDialog open={showModal}>
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
      </AlertDialog>}
    </main>
  )
}

