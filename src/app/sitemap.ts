import type { MetadataRoute } from 'next'
import { locales, defaultLocale } from './constants'
import { fetchPages, fetchEpisodes } from '@/lib/notion'

const siteUrl = process.env.NEXT_PUBLIC_BASE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
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

  // Articles listing page for all locales
  locales.forEach(locale => {
    sitemapEntries.push({
      url: `${siteUrl}/${locale}/articles`,
      lastModified: new Date(),
      alternates: {
        languages: Object.fromEntries(
          locales.map(altLocale => [altLocale, `${siteUrl}/${altLocale}/articles`])
        ),
      },
    })
  })

  // Fetch all Payload CMS pages for all locales
  for (const locale of locales) {
    try {
      const pagesResult = await fetchPages(locale)
      const pages = pagesResult.docs || []
      
      for (const page of pages) {
        const slug = (page as any).slug || (page as any).slug?.value
        if (slug) {
          // Build the URL path from slug
          const slugPath = slug.startsWith('/') ? slug.slice(1) : slug
          const pageUrl = `${siteUrl}/${locale}/${slugPath}`
          
          // Get last modified date if available
          const updatedAt = (page as any).updatedAt || (page as any).createdAt
          const lastModified = updatedAt ? new Date(updatedAt) : new Date()
          
          sitemapEntries.push({
            url: pageUrl,
            lastModified,
            alternates: {
              languages: Object.fromEntries(
                locales.map(altLocale => {
                  // For alternate locales, we'll use the same slug structure
                  // In a real scenario, you might want to fetch the page in that locale
                  // to get the correct localized slug
                  return [altLocale, `${siteUrl}/${altLocale}/${slugPath}`]
                })
              ),
            },
          })
        }
      }
    } catch (error) {
      console.error(`Error fetching pages for locale ${locale}:`, error)
    }
  }

  // Fetch all Payload CMS posts (articles) for all locales
  for (const locale of locales) {
    try {
      const episodesResult = await fetchEpisodes(locale)
      const posts = episodesResult.docs || []
      
      for (const post of posts) {
        const slug = (post as any).slug || (post as any).slug?.value
        if (slug) {
          const postUrl = `${siteUrl}/${locale}/articles/${slug}`
          
          // Get last modified date if available
          const updatedAt = (post as any).updatedAt || (post as any).publishedAt || (post as any).createdAt
          const lastModified = updatedAt ? new Date(updatedAt) : new Date()
          
          sitemapEntries.push({
            url: postUrl,
            lastModified,
            alternates: {
              languages: Object.fromEntries(
                locales.map(altLocale => {
                  // For alternate locales, we'll use the same slug structure
                  return [altLocale, `${siteUrl}/${altLocale}/articles/${slug}`]
                })
              ),
            },
          })
        }
      }
    } catch (error) {
      console.error(`Error fetching posts for locale ${locale}:`, error)
    }
  }
  
  return sitemapEntries
}
