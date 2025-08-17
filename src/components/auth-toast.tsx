'use client'

import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@clerk/clerk-react'
import { toast } from '@/components/ui/sonner'
import { useI18n } from '@/lib/contexts/i18n'
import { SignInButton, SignUpButton } from '@clerk/nextjs'
import { Button } from '@/components/ui/button'
import { LogIn, UserPlus } from 'lucide-react'

interface AuthToastProps {
  showToast?: boolean
}

export const AuthToast = ({ showToast = true }: AuthToastProps) => {
  const { isLoaded, isSignedIn } = useAuth()
  const { t } = useI18n()
  const toastShownRef = useRef(false)
  const [showAuthButtons, setShowAuthButtons] = useState(false)

  useEffect(() => {
    // Only show toast if auth is loaded, user is not signed in, showToast is true, and toast hasn't been shown yet
    if (isLoaded && !isSignedIn && showToast && !toastShownRef.current) {
      // Small delay to ensure the page has loaded
      const timer = setTimeout(() => {
        toastShownRef.current = true
        setShowAuthButtons(true)
        
        toast(t('common.welcome') || 'Welcome to DreamPip!', {
          description: (
            <div className="flex flex-col gap-2 mt-2">
              <p className="text-sm text-muted-foreground">
                {t('common.signInToAccess') || 'Sign in to access your dashboard and track your progress.'}
              </p>
              <p className="text-xs text-muted-foreground">
                Use the authentication buttons below to get started.
              </p>
            </div>
          ),
          duration: 15000, // 15 seconds
          action: {
            label: t('common.dismiss') || 'Dismiss',
            onClick: () => {
              setShowAuthButtons(false)
            },
          },
        })
      }, 3000) // 3 second delay to let the page fully load

      return () => clearTimeout(timer)
    }
  }, [isLoaded, isSignedIn, showToast, t])

  // Reset the ref when user signs in
  useEffect(() => {
    if (isSignedIn) {
      toastShownRef.current = false
      setShowAuthButtons(false)
    }
  }, [isSignedIn])

  // Render auth buttons separately in the UI
  if (showAuthButtons && !isSignedIn) {
    return (
      <div className="fixed bottom-4 right-4 z-50 bg-background border rounded-lg shadow-lg p-4 max-w-sm">
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium">
            {t('common.welcome') || 'Welcome to DreamPip!'}
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
            onClick={() => setShowAuthButtons(false)}
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