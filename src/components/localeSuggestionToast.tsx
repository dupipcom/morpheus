'use client'

import { useEffect, useState } from 'react'
import { useI18n } from '@/lib/contexts/i18n'
import { Button } from '@/components/ui/button'
import { usePathname, useRouter } from 'next/navigation'
import { getLocaleName, setLocaleCookie } from '@/lib/utils/localeUtils'
import { getBestLocale, loadTranslations, t as translate, type Locale } from '@/lib/i18n'
import { getLocaleFromPath, stripLocaleFromPath } from '@/app/helpers'
import { locales } from '@/app/constants'

export const LocaleSuggestionToast = () => {
  const { locale: currentLocale, t: currentT } = useI18n()
  const pathname = usePathname()
  const router = useRouter()
  const [showModal, setShowModal] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [browserLocale, setBrowserLocale] = useState<string | null>(null)
  const [suggestedTranslations, setSuggestedTranslations] = useState<any>(null)

  useEffect(() => {
    // Reset dismissed state when route changes
    setDismissed(false)
    setShowModal(false)
  }, [pathname])

  useEffect(() => {
    // Only run on client side
    if (typeof window === 'undefined') return

    // Get browser preferred locale
    const browserLanguages = navigator.languages || [navigator.language]
    const acceptLanguage = browserLanguages.join(',')
    const preferredLocale = getBestLocale(acceptLanguage)

    // Only show if browser locale is different from current page locale
    if (preferredLocale && preferredLocale !== currentLocale && locales.includes(preferredLocale)) {
      // Check if user has already dismissed this suggestion for this locale combination
      const dismissedKey = `locale_suggestion_dismissed_${currentLocale}_${preferredLocale}`
      const wasDismissed = localStorage.getItem(dismissedKey)
      if (wasDismissed === 'true') {
        setDismissed(true)
        return
      }

      setBrowserLocale(preferredLocale)
      
      // Load translations for the suggested locale
      loadTranslations(preferredLocale as Locale).then((translations) => {
        setSuggestedTranslations(translations)
        // Show modal after translations are loaded and a small delay
        setTimeout(() => {
          setShowModal(true)
        }, 2000) // 2 second delay after translations load
      }).catch((error) => {
        console.error('Failed to load translations for suggested locale:', error)
        // If loading fails, we'll use current locale translations as fallback
        // The modal will still show but with current locale text
        setSuggestedTranslations({}) // Empty object to allow modal to show
        setTimeout(() => {
          setShowModal(true)
        }, 2000)
      })
    } else {
      // Reset translations when no locale suggestion is needed
      setSuggestedTranslations(null)
    }
  }, [currentLocale, pathname])

  const handleAccept = () => {
    if (!browserLocale) return

    // Set locale cookie
    setLocaleCookie(browserLocale)

    // Mark locale suggestion as handled in localStorage
    if (typeof window !== 'undefined' && browserLocale) {
      const handledKey = `locale_suggestion_handled_${currentLocale}_${browserLocale}`
      localStorage.setItem(handledKey, 'accepted')
      
      // Also set dismissed key for future visits
      const dismissedKey = `locale_suggestion_dismissed_${currentLocale}_${browserLocale}`
      localStorage.setItem(dismissedKey, 'true')
    }

    // Get current path without locale
    const pathWithoutLocale = stripLocaleFromPath(pathname || '/')
    
    // Redirect to new locale path
    const newPath = `/${browserLocale}${pathWithoutLocale === '/' ? '' : pathWithoutLocale}`
    router.push(newPath)
    
    setShowModal(false)
    
    // Notify that locale suggestion is handled (for AuthToast coordination)
    window.dispatchEvent(new CustomEvent('localeSuggestionHandled'))
  }

  const handleDismiss = () => {
    setShowModal(false)
    setDismissed(true)
    
    // Store dismissal in localStorage so it doesn't show again for this locale combination
    if (typeof window !== 'undefined' && browserLocale) {
      const dismissedKey = `locale_suggestion_dismissed_${currentLocale}_${browserLocale}`
      localStorage.setItem(dismissedKey, 'true')
      
      // Mark as handled for AuthToast coordination
      const handledKey = `locale_suggestion_handled_${currentLocale}_${browserLocale}`
      localStorage.setItem(handledKey, 'dismissed')
    }
    
    // Notify that locale suggestion is handled (for AuthToast coordination)
    window.dispatchEvent(new CustomEvent('localeSuggestionHandled'))
  }

  // Render modal
  if (showModal && !dismissed && browserLocale && suggestedTranslations !== null) {
    const humanReadableLocale = getLocaleName(browserLocale)
    
    // Use translations from the suggested locale, fallback to current locale if not available
    const t = (key: string, params?: Record<string, string | number>) => {
      if (suggestedTranslations && Object.keys(suggestedTranslations).length > 0) {
        const translated = translate(suggestedTranslations, key, params || {})
        // If translation returns the key itself, it means translation wasn't found, use current locale
        if (translated === key || !translated) {
          return currentT(key, params || {})
        }
        return translated
      }
      // Fallback to current locale translations
      return currentT(key, params || {})
    }
    
    return (
      <div className="fixed bottom-4 right-4 z-[1004] bg-background border rounded-lg shadow-lg p-4 max-w-sm">
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium">
            {t('common.pageAvailableIn', { locale: humanReadableLocale }) || 
             `This page is available in ${humanReadableLocale}. Would you like to view it in it?`}
          </p>
          <div className="flex gap-2">
            <Button 
              size="sm" 
              variant="outline" 
              onClick={handleDismiss}
              className="flex items-center gap-2"
            >
              {t('common.dismiss') || 'Dismiss'}
            </Button>
            <Button 
              size="sm" 
              onClick={handleAccept}
              className="flex items-center gap-2"
            >
              {t('common.accept') || 'Accept'}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return null
}

