import { notFound } from "next/navigation";
import { notion, fetchPages, fetchPageBySlug, fetchPageBlocks } from "@/lib/notion"
import { NotionRenderer } from "@notion-render/client"
import Template from "../_template"

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
}: {
  params: Promise<{ page: string }>
}) {
  const { page } = await params
  const slug = page?.join("/") || "/"

  const pageData = await fetchPageBySlug(slug)
  if (!pageData) notFound()

  const pageContent = await fetchPageBlocks(pageData.id)

  const data = {
    title: pageData.properties.Title.formula.string,
  }

  const renderer = new NotionRenderer()

  const html = await renderer.render(...pageContent)
        
  return <Template title={data.title} content={pageContent} isomorphicContent={html} />
}

