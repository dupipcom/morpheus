import { NextRequest, NextResponse } from 'next/server'
import { lookup } from 'dns/promises'

export interface LinkPreviewData {
  url: string
  title: string | null
  description: string | null
  image: string | null
  favicon: string | null
  siteName: string | null
}

/** Returns true if the IP falls within a private/loopback/link-local range. */
function isPrivateIp(ip: string): boolean {
  // IPv6 loopback
  if (ip === '::1' || ip === '0:0:0:0:0:0:0:1') return true
  // Strip IPv6-mapped IPv4 prefix
  const v4 = ip.startsWith('::ffff:') ? ip.slice(7) : ip

  const parts = v4.split('.').map(Number)
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) return false

  const [a, b] = parts
  return (
    a === 127 || // 127.0.0.0/8 loopback
    a === 10 || // 10.0.0.0/8 private
    (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12 private
    (a === 192 && b === 168) || // 192.168.0.0/16 private
    (a === 169 && b === 254) || // 169.254.0.0/16 link-local
    a === 0 // 0.0.0.0/8
  )
}

/** Resolves the hostname and rejects private/internal addresses (SSRF guard). */
async function validateHostname(hostname: string): Promise<void> {
  // Block obvious localhost variants before DNS lookup
  const lower = hostname.toLowerCase()
  if (lower === 'localhost' || lower === 'localhost.') {
    throw new Error('Private host')
  }

  let addresses: string[]
  try {
    const result = await lookup(hostname, { all: true })
    addresses = result.map((r) => r.address)
  } catch {
    throw new Error('DNS resolution failed')
  }

  if (addresses.some(isPrivateIp)) {
    throw new Error('Private host')
  }
}

function extractMeta(html: string, property: string): string | null {
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

  // Validate URL structure
  let parsedUrl: URL
  try {
    parsedUrl = new URL(url)
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return NextResponse.json({ error: 'Invalid URL protocol' }, { status: 400 })
    }
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 })
  }

  // SSRF protection: reject private/internal hosts
  try {
    await validateHostname(parsedUrl.hostname)
  } catch {
    return NextResponse.json({ error: 'URL not allowed' }, { status: 400 })
  }

  try {
    const response = await fetch(parsedUrl.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; DupipBot/1.0; +https://dupip.com)',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      signal: AbortSignal.timeout(10000),
      redirect: 'follow',
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const contentType = response.headers.get('content-type') || ''
    if (!contentType.includes('text/html')) {
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

    // Read up to 500 KB; stop after </head> to avoid parsing huge pages
    const reader = response.body?.getReader()
    if (!reader) throw new Error('No body')

    const decoder = new TextDecoder()
    let html = ''
    let bytesRead = 0
    const maxBytes = 500 * 1024
    const headTag = '</head>'

    while (bytesRead < maxBytes) {
      const { done, value } = await reader.read()
      if (done) {
        // Flush decoder on final chunk
        html += decoder.decode(undefined, { stream: false })
        break
      }
      html += decoder.decode(value, { stream: true })
      bytesRead += value.length
      // Use lastIndexOf to find the closing head tag without re-scanning the whole string each time
      if (html.length >= headTag.length && html.lastIndexOf(headTag) !== -1) break
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

