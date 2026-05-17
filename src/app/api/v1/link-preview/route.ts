import { NextRequest, NextResponse } from 'next/server'

export interface LinkPreviewData {
  url: string
  title: string | null
  description: string | null
  image: string | null
  favicon: string | null
  siteName: string | null
}

function extractMeta(html: string, property: string): string | null {
  // Match og: and twitter: meta properties, as well as name attributes
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property}["']`, 'i'),
    new RegExp(`<meta[^>]+name=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${property}["']`, 'i'),
  ]

  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match?.[1]) return match[1].trim()
  }
  return null
}

function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  return match?.[1]?.trim() || null
}

function extractFavicon(html: string, baseUrl: string): string | null {
  // Try to find link[rel=icon] or link[rel="shortcut icon"]
  const patterns = [
    /<link[^>]+rel=["'](?:shortcut )?icon["'][^>]+href=["']([^"']+)["']/i,
    /<link[^>]+href=["']([^"']+)["'][^>]+rel=["'](?:shortcut )?icon["']/i,
    /<link[^>]+rel=["']apple-touch-icon["'][^>]+href=["']([^"']+)["']/i,
    /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']apple-touch-icon["']/i,
  ]

  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match?.[1]) {
      const href = match[1].trim()
      if (href.startsWith('http')) return href
      if (href.startsWith('//')) return `https:${href}`
      if (href.startsWith('/')) {
        const origin = new URL(baseUrl).origin
        return `${origin}${href}`
      }
      return `${baseUrl}/${href}`
    }
  }

  // Fallback to default /favicon.ico
  try {
    const origin = new URL(baseUrl).origin
    return `${origin}/favicon.ico`
  } catch {
    return null
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const url = searchParams.get('url')

  if (!url) {
    return NextResponse.json({ error: 'URL is required' }, { status: 400 })
  }

  // Validate URL
  let parsedUrl: URL
  try {
    parsedUrl = new URL(url)
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return NextResponse.json({ error: 'Invalid URL protocol' }, { status: 400 })
    }
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 })
  }

  try {
    const response = await fetch(parsedUrl.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; DupipBot/1.0; +https://dupip.com)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      signal: AbortSignal.timeout(5000),
      redirect: 'follow',
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const contentType = response.headers.get('content-type') || ''
    if (!contentType.includes('text/html')) {
      // Non-HTML resource — return basic link data
      const preview: LinkPreviewData = {
        url: parsedUrl.toString(),
        title: parsedUrl.hostname,
        description: null,
        image: null,
        favicon: `${parsedUrl.origin}/favicon.ico`,
        siteName: parsedUrl.hostname,
      }
      return NextResponse.json(preview, {
        headers: { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' },
      })
    }

    // Read up to 500KB to avoid large pages
    const reader = response.body?.getReader()
    if (!reader) throw new Error('No body')

    let html = ''
    let bytesRead = 0
    const maxBytes = 500 * 1024

    while (bytesRead < maxBytes) {
      const { done, value } = await reader.read()
      if (done) break
      html += new TextDecoder().decode(value)
      bytesRead += value.length
      // Stop once we have the head section — no need to parse entire page
      if (html.includes('</head>')) break
    }
    reader.cancel()

    const ogTitle = extractMeta(html, 'og:title')
    const ogDescription = extractMeta(html, 'og:description')
    const ogImage = extractMeta(html, 'og:image')
    const ogSiteName = extractMeta(html, 'og:site_name')
    const twitterTitle = extractMeta(html, 'twitter:title')
    const twitterDescription = extractMeta(html, 'twitter:description')
    const twitterImage = extractMeta(html, 'twitter:image')
    const metaDescription = extractMeta(html, 'description')
    const pageTitle = extractTitle(html)
    const favicon = extractFavicon(html, parsedUrl.toString())

    // Resolve relative og:image URLs
    let resolvedImage = ogImage || twitterImage || null
    if (resolvedImage) {
      if (resolvedImage.startsWith('//')) {
        resolvedImage = `https:${resolvedImage}`
      } else if (resolvedImage.startsWith('/')) {
        resolvedImage = `${parsedUrl.origin}${resolvedImage}`
      } else if (!resolvedImage.startsWith('http')) {
        resolvedImage = `${parsedUrl.origin}/${resolvedImage}`
      }
    }

    const preview: LinkPreviewData = {
      url: parsedUrl.toString(),
      title: ogTitle || twitterTitle || pageTitle,
      description: ogDescription || twitterDescription || metaDescription,
      image: resolvedImage,
      favicon,
      siteName: ogSiteName || parsedUrl.hostname,
    }

    return NextResponse.json(preview, {
      headers: { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' },
    })
  } catch {
    // Return basic fallback on any fetch error
    const preview: LinkPreviewData = {
      url: parsedUrl.toString(),
      title: parsedUrl.hostname,
      description: null,
      image: null,
      favicon: `${parsedUrl.origin}/favicon.ico`,
      siteName: parsedUrl.hostname,
    }
    return NextResponse.json(preview, {
      headers: { 'Cache-Control': 'public, max-age=300' },
    })
  }
}
