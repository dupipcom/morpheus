import React from "react"
import { fetchPageBySlug } from "@/lib/notion"
import { RichText } from '@payloadcms/richtext-lexical/react'
import { stripLocaleFromPath } from "../../helpers"

export default async function PageHero({
  params,
  children,
}: {
  params: Promise<{ locale: string; page?: string[] }>
  children: React.ReactNode
}) {
  const { locale, page = [] } = await params
  
  // Reconstruct the full path as it would appear in the URL
  const fullPath = "/" + locale + "/" + (page?.join("/") || "")
  
  // Strip locale to get the actual slug
  const clearSlug = stripLocaleFromPath(fullPath)

  const pageData = await fetchPageBySlug(clearSlug)

  const heroRichText = (pageData as any)?.hero?.richText
  const layoutRichText = (pageData as any)?.layout?.[0]?.columns?.[0]?.richText

  return (
    <>
      {heroRichText && (
        <div className="hero-content p-8 m-8 flex items-center justify-center">
          <RichText data={heroRichText} className="text-[32px] md:text-[72px]" />
        </div>
      )}
      {layoutRichText && (
        <div className="layout-content p-8">
          <RichText data={layoutRichText} className="text-[12px] md:text-[16px] leading-[2]" />
        </div>
      )}
      {children}
    </>
  )
}

