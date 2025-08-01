import { notFound } from "next/navigation";
import { notion, fetchPages, fetchPageBySlug, fetchPageBlocks } from "@/lib/notion"
import { NotionRenderer } from "@notion-render/client"
import Template from "../_template"
import { stripLocaleFromPath, getLocaleFromPath } from "../helpers"

export async function generateStaticParams() {
  const pages = await fetchPages()
 
  return pages.results.map((page) => {
    const params = {
      slug: page.properties.Slug.formula.string,
    }
    return params
  })
}

export default async function Page({
  params,
  session,
}: {
  params: Promise<{ page: string }>
}) {
  const { page, lang } = await params
  const slug = "/" + page?.join("/") || "/"

  console.log({ slug })
  const locale = getLocaleFromPath(slug)
  const clearSlug = stripLocaleFromPath(slug)

  const pageData = await fetchPageBySlug(clearSlug)


  if (!pageData) {
    notFound()
    return
  }

  const contentProperty = `$content_${locale}`

  const localizedContentId = pageData?.properties[contentProperty]?.relation[0]?.id

  const pageContent = await fetchPageBlocks(localizedContentId || pageData.id)
  

  const data = {
    title: pageData.properties.Title.formula.string,
  }

  const renderer = new NotionRenderer()

  const html = renderer ? await renderer?.render(...pageContent) : undefined
        
  return <Template title={data.title} content={pageContent} isomorphicContent={html} />
}

