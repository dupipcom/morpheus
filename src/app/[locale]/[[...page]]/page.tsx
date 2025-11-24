import { notFound } from "next/navigation";
import { fetchPages, fetchPageBySlug, fetchPageBlocks, fetchArticles } from "@/lib/payload"
import { RichText } from '@payloadcms/richtext-lexical/react'
import Template from "../../_template"
import type { Metadata } from 'next'
import { buildMetadata } from '@/app/metadata'
import { stripLocaleFromPath, getLocaleFromPath } from "../../helpers"
import ArticleCardGrid from '@/components/articleCardGrid'

export async function generateStaticParams() {
  const locales = ['ar', 'bn', 'ca', 'cs', 'da', 'de', 'el', 'en', 'es', 'et', 'eu', 'fi', 'fr', 'gl', 'he', 'hi', 'hu', 'it', 'ja', 'ko', 'ms', 'nl', 'pa', 'pl', 'pt', 'ro', 'ru', 'sv', 'tr', 'zh']

  const params = []
  for (const locale of locales) {
    const pages = await fetchPages(locale)
    // Payload CMS returns docs array instead of results
    for (const page of pages.docs || []) {
      // Payload CMS structure: direct field access instead of properties
      const slug = (page as any).slug || (page as any).slug?.value
      if (slug) {
        params.push({
          locale,
          page: slug.split('/').filter(Boolean)
        })
      }
    }
  }
  return params
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string; page?: string[] }> }): Promise<Metadata> {
  const { locale, page = [] } = await params
  const fullPath = "/" + locale + "/" + (page?.join("/") || "")
  const clearSlug = stripLocaleFromPath(fullPath)

  try {
    const pageData = await fetchPageBySlug(clearSlug, locale)
    // Payload CMS structure: direct field access instead of properties
    const title = (pageData as any)?.title || (pageData as any)?.title?.value || 'Dupip'
    const description = (pageData as any)?.description || (pageData as any)?.description?.value || undefined
    return await buildMetadata({ title, description, locale })
  } catch (e) {
    return await buildMetadata({ locale })
  }
}

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; page: string[] }>
}) {
  const { locale, page } = await params
  
  // Reconstruct the full path as it would appear in the URL
  const fullPath = "/" + locale + "/" + (page?.join("/") || "")
  
  // Use the original logic: strip locale to get the actual slug for Notion
  const clearSlug = stripLocaleFromPath(fullPath)

  const pageData = await fetchPageBySlug(clearSlug, locale)

  if (!pageData) {
    notFound()
    return
  }

  const contentProperty = `content_${locale}`

  // Payload CMS structure: direct field access, relations might be objects or IDs
  const localizedContent = (pageData as any)?.[contentProperty]
  const localizedContentId = typeof localizedContent === 'object' && localizedContent?.id 
    ? localizedContent.id 
    : typeof localizedContent === 'string' 
    ? localizedContent 
    : null

  const pageContent = await fetchPageBlocks(localizedContentId || (pageData as any).id, locale)
  

  const data = {
    // Payload CMS structure: direct field access instead of properties
    title: (pageData as any)?.title || (pageData as any)?.title?.value || 'Untitled',
  }

  // Check if this is the homepage (when clearSlug is empty or just "/")
  const isHomepage = !clearSlug || clearSlug === '/' || clearSlug === '';
  
  // Fetch recent articles for homepage
  let recentArticles: any[] = [];
  if (isHomepage) {
    const episodes = await fetchArticles(locale);
    // Sort by publishedAt descending and take the 3 latest
    recentArticles = (episodes.docs || [])
      .sort((a: any, b: any) => {
        const dateA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
        const dateB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
        return dateB - dateA;
      })
      .slice(0, 3);
  }

  // Note: html is no longer needed since we're using Payload CMS
  // The RichText component in @page.tsx will handle hero rendering
  return (
    <>
      <Template title={data.title} content={pageContent} isomorphicContent={undefined} />
      {isHomepage && recentArticles.length > 0 && (
        <div className="container mx-auto px-4 pb-8 max-w-6xl">
          <ArticleCardGrid 
            posts={recentArticles} 
            locale={locale} 
            title="Recent Articles"
            limit={3}
          />
        </div>
      )}
    </>
  )
}

