'use client'

import { ReactNode } from 'react'
import { useAuth } from '@clerk/clerk-react'
import { useI18n } from '@/lib/contexts/i18n'
import { AuthTracker } from '@/components/auth-tracker'
import { Skeleton } from '@/components/ui/skeleton'
import { useState, useEffect } from 'react'

interface AppContentProps {
  children: ReactNode
}

export function AppContent({ children }: AppContentProps) {
  const { isLoaded: authLoaded, isSignedIn } = useAuth()
  const { isLoading: i18nLoading } = useI18n()
  const [isAppReady, setIsAppReady] = useState(false)

  useEffect(() => {
    // App is ready when:
    // 1. Authentication is loaded
    // 2. Translations are loaded
    if (authLoaded && !i18nLoading) {
      setIsAppReady(true)
    }
  }, [authLoaded, i18nLoading])

  // Show skeleton while app is loading
//   if (!isAppReady) {
//     return <Skeleton className="bg-muted h-[75vh] w-full z-[999]" />
//   }

  // Show children directly if user is not signed in
  if (!isSignedIn) {
    return <>{children}</>
  }

  // Show authenticated content wrapped in AuthTracker
  return <AuthTracker>{children}</AuthTracker>
} 