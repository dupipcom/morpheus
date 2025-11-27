import type { MetadataRoute } from 'next'
import { locales, defaultLocale } from './constants'
import { fetchAllPages, fetchAllArticles } from '@/lib/payload'

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
    'do',
    'feel',
    'profile',
    'be',
    'invest',
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

  // Magazine listing page for all locales
  locales.forEach(locale => {
    sitemapEntries.push({
      url: `${siteUrl}/${locale}/magazine`,
      lastModified: new Date(),
      alternates: {
        languages: Object.fromEntries(
          locales.map(altLocale => [altLocale, `${siteUrl}/${altLocale}/magazine`])
        ),
      },
    })
  })

  // Fetch all Payload CMS pages once, then create entries for all locales
  try {
    const pagesResult = await fetchAllPages()
    const pages = pagesResult.docs || []
    
    for (const page of pages) {
      const slug = (page as any).slug || (page as any).slug?.value
      if (slug) {
        // Build the URL path from slug
        const slugPath = slug.startsWith('/') ? slug.slice(1) : slug
        
        // Get last modified date if available
        const updatedAt = (page as any).updatedAt || (page as any).createdAt
        const lastModified = updatedAt ? new Date(updatedAt) : new Date()
        
        // Create entries for all locales using the same slug
        locales.forEach(locale => {
          const pageUrl = `${siteUrl}/${locale}/${slugPath}`
          sitemapEntries.push({
            url: pageUrl,
            lastModified,
            alternates: {
              languages: Object.fromEntries(
                locales.map(altLocale => [altLocale, `${siteUrl}/${altLocale}/${slugPath}`])
              ),
            },
          })
        })
      }
    }
  } catch (error) {
    console.error('Error fetching pages:', error)
  }

  // Fetch all Payload CMS posts (articles) once, then create entries for all locales
  try {
    const episodesResult = await fetchAllArticles()
    const posts = episodesResult.docs || []
    
    for (const post of posts) {
      const slug = (post as any).slug || (post as any).slug?.value
      if (slug) {
        // Get last modified date if available
        const updatedAt = (post as any).updatedAt || (post as any).publishedAt || (post as any).createdAt
        const lastModified = updatedAt ? new Date(updatedAt) : new Date()
        
        // Create entries for all locales using the same slug
        locales.forEach(locale => {
          const postUrl = `${siteUrl}/${locale}/magazine/${slug}`
          sitemapEntries.push({
            url: postUrl,
            lastModified,
            alternates: {
              languages: Object.fromEntries(
                locales.map(altLocale => [altLocale, `${siteUrl}/${altLocale}/magazine/${slug}`])
              ),
            },
          })
        })
      }
    }
  } catch (error) {
    console.error('Error fetching posts:', error)
  }
  
  return sitemapEntries
}
