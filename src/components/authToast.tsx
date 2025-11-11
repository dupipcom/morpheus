'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@clerk/clerk-react'
import { useI18n } from '@/lib/contexts/i18n'
import { SignInButton, SignUpButton } from '@clerk/nextjs'
import { Button } from '@/components/ui/button'
import { LogIn, UserPlus } from 'lucide-react'
import { usePathname } from 'next/navigation'

interface AuthToastProps {
  showToast?: boolean
}

export const AuthToast = ({ showToast = true }: AuthToastProps) => {
  const { isLoaded, isSignedIn } = useAuth()
  const { t } = useI18n()
  const pathname = usePathname()
  const [showAuthButtons, setShowAuthButtons] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    // Reset dismissed state when route changes
    setDismissed(false)
  }, [pathname])

  useEffect(() => {
    // Only show auth panel if auth is loaded, user is not signed in, showToast is true, and hasn't been dismissed
    if (isLoaded && !isSignedIn && showToast && !dismissed) {
      // Small delay to ensure the page has loaded
      const timer = setTimeout(() => {
        setShowAuthButtons(true)
      }, 3000) // 3 second delay to let the page fully load

      return () => clearTimeout(timer)
    } else if (isSignedIn) {
      // Hide auth buttons when user signs in
      setShowAuthButtons(false)
      setDismissed(false)
    }
  }, [isLoaded, isSignedIn, showToast, dismissed, pathname])

  // Render auth buttons in a fixed overlay
  if (showAuthButtons && !isSignedIn) {
    return (
      <div className="fixed bottom-4 right-4 z-50 bg-background border rounded-lg shadow-lg p-4 max-w-sm">
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium">
            {t('common.welcome') || 'Welcome to Dupip!'}
          </p>
          <p className="text-xs text-muted-foreground">
            {t('common.signInToAccess') || 'Sign in to access your dashboard and track your progress.'}
          </p>
          <div className="flex gap-2">
            <SignInButton>
              <Button size="sm" variant="outline" className="flex items-center gap-2">
                <LogIn className="w-4 h-4" />
                {t('common.login')}
              </Button>
            </SignInButton>
            <SignUpButton>
              <Button size="sm" className="flex items-center gap-2">
                <UserPlus className="w-4 h-4" />
                {t('common.signUp')}
              </Button>
            </SignUpButton>
          </div>
          <Button 
            size="sm" 
            variant="ghost" 
            onClick={() => {
              setShowAuthButtons(false)
              setDismissed(true)
            }}
            className="text-xs"
          >
            {t('common.dismiss') || 'Dismiss'}
          </Button>
        </div>
      </div>
    )
  }

  return null
} 