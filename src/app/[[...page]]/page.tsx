import { notFound } from "next/navigation";
import { notion, fetchPages, fetchPageBySlug, fetchPageBlocks } from "@/lib/notion"
import bookmarkPlugin from "@notion-render/bookmark-plugin"
import { NotionRenderer } from "@notion-render/client"
import hljsPlugin from "@notion-render/hljs-plugin"
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

  const renderer = new NotionRenderer({
      client: notion,
  });

  renderer.use(hljsPlugin())
  renderer.use(bookmarkPlugin())

  const html = await renderer.render(...pageContent)
        
  return <Template title={data.title} content={html} />
}

