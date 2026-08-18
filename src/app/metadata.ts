import type { Metadata } from 'next'
import { loadTranslationsSync } from '@/lib/i18n'
import { defaultLocale } from '@/app/constants'

const siteName = 'Dupip'
const siteDescription = 'Fintech for compassion. Find your formula for happiness. Unlock money to track mood, habits and share your progress with friends.'
const siteUrl = process.env.NEXT_PUBLIC_BASE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
const defaultImage = `${siteUrl}/public/images/logo-social.jpg`.replace(/\/+/, '/')

export const defaultMetadata: Metadata = {
  title: {
    default: siteName,
    template: `%s · ${siteName}`,
  },
  description: siteDescription,
  metadataBase: new URL(siteUrl),
  openGraph: {
    title: siteName,
    description: siteDescription,
    url: siteUrl,
    siteName,
    images: [
      {
        url: '/images/logo-social.jpg',
        width: 1200,
        height: 630,
        alt: 'Dupip',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: siteName,
    description: siteDescription,
    images: ['/images/logo-social.jpg'],
  },
  icons: {
    icon: '/favicon.ico',
  },
}

export async function buildMetadata({
  title,
  description,
  image,
  type = 'website',
  locale,
}: {
  title?: string
  description?: string
  image?: string | null
  type?: 'website' | 'profile' | 'article' | 'list' | 'event'
  locale?: string
} = {}): Promise<Metadata> {
  // NOTE: reading the middleware-set `dpip_bot_en` cookie here used to force
  // English metadata for ambiguous bots. Removed: cookies() is a dynamic API,
  // and on statically-optimized routes (e.g. the [[...page]] catch-all) any
  // non-prerendered URL renders at runtime in static mode, where Next throws
  // "Page changed from static to dynamic at runtime". Metadata now follows
  // the URL locale.
  const lang = (locale || defaultLocale) as any
  const translations = loadTranslationsSync(lang)
  const localizedSiteName: string = translations?.seo?.siteName || siteName
  const localizedSiteDescription: string = translations?.seo?.siteDescription || siteDescription

  const baseTitle = title || (defaultMetadata.title as any)?.default || localizedSiteName
  const resolvedTitle = baseTitle.includes(`· ${localizedSiteName}`) ? baseTitle : `${baseTitle} · ${localizedSiteName}`
  const resolvedDescription = description || localizedSiteDescription
  const resolvedImage = image ? [image] : defaultImage
  const images = image ? [image] : ['/images/logo-social.jpg']

  // 'list' and 'event' are app-level types; fall back to the generic 'website' OG type
  const ogType = type === 'profile' || type === 'article' ? type : 'website'

  return {
    title: resolvedTitle,
    description: resolvedDescription,
    openGraph: {
      title: resolvedTitle,
      description: resolvedDescription,
      siteName: localizedSiteName,
      images,
      type: ogType,
    },
    twitter: {
      card: 'summary_large_image',
      title: resolvedTitle,
      description: resolvedDescription,
      images,
    },
  }
}


