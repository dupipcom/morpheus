import { notFound } from "next/navigation";
import { notion, fetchPages, fetchPageBySlug, fetchPageBlocks } from "@/lib/notion"
import { NotionRenderer } from "@notion-render/client"
import Template from "../../_template"
import { stripLocaleFromPath, getLocaleFromPath } from "../../helpers"

export async function generateStaticParams() {
  const pages = await fetchPages()
  const locales = ['ar', 'bn', 'ca', 'cs', 'da', 'de', 'el', 'en', 'es', 'et', 'eu', 'fi', 'fr', 'gl', 'he', 'hi', 'hu', 'it', 'ja', 'ko', 'ms', 'nl', 'pa', 'pl', 'pt', 'ro', 'ru', 'sv', 'tr', 'zh']
 
  const params = []
  for (const locale of locales) {
    for (const page of pages.results) {
      const slug = (page as any).properties?.Slug?.formula?.string
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

  const contentProperty = `$content_${locale}`

  const localizedContentId = (pageData as any)?.properties?.[contentProperty]?.relation?.[0]?.id

  const pageContent = await fetchPageBlocks(localizedContentId || pageData.id)
  

  const data = {
    title: (pageData as any).properties?.Title?.formula?.string || 'Untitled',
  }

  const renderer = new NotionRenderer()

  const html = renderer ? await renderer?.render(...pageContent) : undefined
        
  return <Template title={data.title} content={pageContent} isomorphicContent={html} />
}

