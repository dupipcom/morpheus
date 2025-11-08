import type { MetadataRoute } from 'next'
import { locales, defaultLocale } from './constants'

const siteUrl = process.env.NEXT_PUBLIC_BASE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

export default function sitemap(): MetadataRoute.Sitemap {
  const sitemapEntries: MetadataRoute.Sitemap = []

  // Root page
  sitemapEntries.push({
    url: siteUrl,
    lastModified: new Date(),
    alternates: {
      languages: Object.fromEntries(
        locales.map(locale => [locale, `${siteUrl}/${locale}`])
      ),
    },
  })

  // Main app routes
  const appRoutes = [
    'dashboard',
    'day', 
    'week',
    'be',
    'settings',
    'profile'
  ]

  // Generate entries for each app route with all locales
  appRoutes.forEach(route => {
    locales.forEach(locale => {
      sitemapEntries.push({
        url: `${siteUrl}/${locale}/app/${route}`,
        lastModified: new Date(),
        alternates: {
          languages: Object.fromEntries(
            locales.map(altLocale => [altLocale, `${siteUrl}/${altLocale}/app/${route}`])
          ),
        },
      })
    })
  })

  // Dynamic user profile pages (these would be generated at build time or runtime)
  // Note: You might want to fetch actual user profiles from your database
  // and generate entries for them dynamically
  
  return sitemapEntries
}
