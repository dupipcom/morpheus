'use client'

import { ReactNode } from 'react'
import { useLocalStorage } from 'usehooks-ts'
import { useState, useEffect } from 'react'
import { getLocaleCookie } from '@/lib/localeUtils'
import { I18nProvider } from "@/lib/contexts/i18n"
import { GlobalContext } from "@/lib/contexts"
import { Nav } from '@/components/ui/nav'
import { Footer } from '@/components/footer'
import { Toaster } from '@/components/ui/sonner'
import { AuthWrapper } from '@/components/authWrapper'
import { AuthToast } from '@/components/authToast'
import { AppContent } from '@/components/appContent'

interface ClientLayoutWrapperProps {
  children: ReactNode
  locale: string
}

export default function ClientLayoutWrapper({ children, locale }: ClientLayoutWrapperProps) {
  // Deprecated: Root provider moved to src/app/layout.tsx
  return (
    <I18nProvider locale={locale}>
      {children}
    </I18nProvider>
  )
}
