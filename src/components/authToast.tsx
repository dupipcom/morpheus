'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@clerk/clerk-react'
import { useI18n } from '@/lib/contexts/i18n'
import { SignInButton, SignUpButton } from '@clerk/nextjs'
import { Button } from '@/components/ui/button'
import { LogIn, UserPlus } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { getBestLocale } from '@/lib/i18n'
import { locales } from '@/app/constants'
import { track } from '@vercel/analytics'

interface AuthToastProps {
  showToast?: boolean
}

export const AuthToast = ({ showToast = true }: AuthToastProps) => {
  const { isLoaded, isSignedIn } = useAuth()
  const { t, locale } = useI18n()
  const pathname = usePathname()
  const [showAuthButtons, setShowAuthButtons] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [localeSuggestionHandled, setLocaleSuggestionHandled] = useState(false)

  useEffect(() => {
    // Reset dismissed state when route changes
    setDismissed(false)
    setLocaleSuggestionHandled(false)
  }, [pathname])

  useEffect(() => {
    // Check if there's a locale suggestion that needs to be handled first
    if (typeof window === 'undefined') {
      setLocaleSuggestionHandled(true)
      return
    }
    
    // Get browser preferred locale
    const browserLanguages = navigator.languages || [navigator.language]
    const acceptLanguage = browserLanguages.join(',')
    const preferredLocale = getBestLocale(acceptLanguage)
    
    // Check if locale suggestion should be shown
    if (preferredLocale && preferredLocale !== locale && locales.includes(preferredLocale)) {
      // Check if it was already handled in this session
      const handledKey = `locale_suggestion_handled_${locale}_${preferredLocale}`
      const wasHandled = localStorage.getItem(handledKey)
      
      // Check if it was dismissed in a previous session
      const dismissedKey = `locale_suggestion_dismissed_${locale}_${preferredLocale}`
      const wasDismissed = localStorage.getItem(dismissedKey)
      
      if (wasHandled === 'accepted' || wasHandled === 'dismissed' || wasDismissed === 'true') {
        // Already handled or dismissed, proceed with auth modal
        setLocaleSuggestionHandled(true)
      } else {
        // Wait for locale suggestion to be handled
        const handleLocaleHandled = () => {
          setLocaleSuggestionHandled(true)
          window.removeEventListener('localeSuggestionHandled', handleLocaleHandled)
        }
        window.addEventListener('localeSuggestionHandled', handleLocaleHandled)
        
        // Cleanup listener on unmount
        return () => {
          window.removeEventListener('localeSuggestionHandled', handleLocaleHandled)
        }
      }
    } else {
      // No locale suggestion to show, so we can proceed immediately
      setLocaleSuggestionHandled(true)
    }
  }, [locale, pathname])

  useEffect(() => {
    // Only show auth panel if:
    // - auth is loaded
    // - user is not signed in
    // - showToast is true
    // - hasn't been dismissed
    // - locale suggestion has been handled (or doesn't need to be shown)
    if (isLoaded && !isSignedIn && showToast && !dismissed && localeSuggestionHandled) {
      // Check if we're on an articles page - use 15 second delay for articles, 3 seconds for other pages
      const isArticlesPage = pathname?.includes('/articles/')
      const delay = isArticlesPage ? 15000 : 3000
      
      // Small delay to ensure the page has loaded
      const timer = setTimeout(() => {
        setShowAuthButtons(true)
      }, delay)

      return () => clearTimeout(timer)
    } else if (isSignedIn) {
      // Hide auth buttons when user signs in
      setShowAuthButtons(false)
      setDismissed(false)
    }
  }, [isLoaded, isSignedIn, showToast, dismissed, pathname, localeSuggestionHandled])

  // Render auth buttons in a fixed overlay
  if (showAuthButtons && !isSignedIn) {
    return (
      <div className="fixed bottom-4 right-4 z-[1003] bg-background border rounded-lg shadow-lg p-4 max-w-sm">
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium">
            {t('common.welcome') || 'Welcome to Dupip!'}
          </p>
          <p className="text-xs text-muted-foreground">
            {t('common.signInToAccess') || 'Sign in to access your dashboard and track your progress.'}
          </p>
          <div className="flex gap-2">
            <SignInButton>
              <Button 
                size="sm" 
                variant="outline" 
                className="flex items-center gap-2"
                onClick={() => track('Login', { location: 'authToast' })}
              >
                <LogIn className="w-4 h-4" />
                {t('common.login')}
              </Button>
            </SignInButton>
            <SignUpButton>
              <Button 
                size="sm" 
                className="flex items-center gap-2"
                onClick={() => track('Sign Up', { location: 'authToast' })}
              >
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