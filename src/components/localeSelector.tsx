'use client'

import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useI18n } from '@/lib/contexts/i18n'
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select'
import { getAvailableLocales, setLocaleCookie, getLocaleCookie } from '@/lib/utils/localeUtils'
import { locales } from '@/app/constants'

interface LocaleSelectorProps {
  className?: string
}

export function LocaleSelector({ className }: LocaleSelectorProps) {
  const { locale, t } = useI18n()
  const router = useRouter()
  const pathname = usePathname()
  const [currentLocale, setCurrentLocale] = useState(locale)
  const availableLocales = getAvailableLocales()

  // Initialize with cookie value if available
  useEffect(() => {
    const cookieLocale = getLocaleCookie()
    if (cookieLocale && locales.includes(cookieLocale)) {
      setCurrentLocale(cookieLocale)
    }
  }, [])

  const handleLocaleChange = (newLocale: string) => {
    if (newLocale === currentLocale) return

    // Set cookie
    setLocaleCookie(newLocale)
    setCurrentLocale(newLocale)

    // Redirect to new locale path
    const currentPath = pathname
    const currentLocalePath = `/${locale}`
    
    if (currentPath.startsWith(currentLocalePath)) {
      // Replace current locale with new locale
      const newPath = currentPath.replace(currentLocalePath, `/${newLocale}`)
      router.push(newPath)
    } else {
      // Add locale prefix if not present
      router.push(`/${newLocale}${currentPath}`)
    }
  }

  return (
    <Select value={currentLocale} onValueChange={handleLocaleChange}>
      <SelectTrigger className={`w-[140px] ${className || ''}`}>
        <SelectValue placeholder={t('common.selectLanguage') || "Select language"} />
      </SelectTrigger>
      <SelectContent className="z-[1001]">
        {availableLocales.map((localeOption) => (
          <SelectItem key={localeOption.value} value={localeOption.value}>
            {localeOption.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
} 