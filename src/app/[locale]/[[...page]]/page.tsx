import { notFound } from "next/navigation";
import { fetchPages, fetchPageBySlug, fetchPageBlocks } from "@/lib/notion"
import { RichText } from '@payloadcms/richtext-lexical/react'
import { NotionRenderer } from "@notion-render/client"
import Template from "../../_template"
import type { Metadata } from 'next'
import { buildMetadata } from '@/app/metadata'
import { stripLocaleFromPath, getLocaleFromPath } from "../../helpers"

export async function generateStaticParams() {
  const pages = await fetchPages()

  const locales = ['ar', 'bn', 'ca', 'cs', 'da', 'de', 'el', 'en', 'es', 'et', 'eu', 'fi', 'fr', 'gl', 'he', 'hi', 'hu', 'it', 'ja', 'ko', 'ms', 'nl', 'pa', 'pl', 'pt', 'ro', 'ru', 'sv', 'tr', 'zh']

  const params = []
  for (const locale of locales) {
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
    const pageData = await fetchPageBySlug(clearSlug)
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

  const pageData = await fetchPageBySlug(clearSlug)

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

  const pageContent = await fetchPageBlocks(localizedContentId || (pageData as any).id)
  

  const data = {
    // Payload CMS structure: direct field access instead of properties
    title: (pageData as any)?.title || (pageData as any)?.title?.value || 'Untitled',
  }


  // Note: html is no longer needed since we're using Payload CMS
  // The RichText component in @page.tsx will handle hero rendering
  return <Template title={data.title} content={pageContent} isomorphicContent={undefined} />
}

