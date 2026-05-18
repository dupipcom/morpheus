export type SupportedMediaProvider =
  | 'youtube'
  | 'soundcloud'
  | 'vimeo'
  | 'mixcloud'
  | 'spotify'
  | 'tidal'
  | 'apple-music'

export interface MediaEmbedConfig {
  provider: SupportedMediaProvider
  providerLabel: string
  embedUrl: string
  title: string
  aspectRatio?: string
  minHeight?: number
}

/**
 * URL pattern that matches http/https URLs including IPv4 hosts and ports.
 * Sections:
 * - protocol: http:// or https://
 * - host: IPv4 or dotted domain name
 * - port: optional :3000 style suffix
 * - path: optional path while trimming common trailing punctuation
 * Trailing punctuation characters (.,;:!?'")] ) are excluded from the URL end.
 * A factory function is used to always return a new regex instance and avoid
 * shared `lastIndex` state across concurrent calls.
 */
export function createUrlRegex() {
  return /https?:\/\/(?:(?:\d{1,3}\.){3}\d{1,3}|(?:[-\w]+\.)+[a-z]{2,})(?::\d{1,5})?(?:\/[^\s]*[^\s.,;:!?'")\]])?/gi
}

/**
 * Extract unique URLs from a string.
 */
export function extractUrls(text: string): string[] {
  const matches = text.match(createUrlRegex())
  if (!matches) return []
  return [...new Set(matches)]
}

function parseUrl(rawUrl: string): URL | null {
  try {
    return new URL(rawUrl)
  } catch {
    return null
  }
}

function hasHostname(url: URL, hostname: string) {
  return url.hostname === hostname || url.hostname.endsWith(`.${hostname}`)
}

function getPathSegments(url: URL) {
  return url.pathname.split('/').filter(Boolean)
}

function getYouTubeEmbed(url: URL): MediaEmbedConfig | null {
  let videoId: string | null = null

  if (hasHostname(url, 'youtu.be')) {
    videoId = getPathSegments(url)[0] || null
  } else if (hasHostname(url, 'youtube.com') || hasHostname(url, 'youtube-nocookie.com')) {
    const segments = getPathSegments(url)
    if (url.pathname === '/watch') {
      videoId = url.searchParams.get('v')
    } else if (segments[0] === 'shorts' || segments[0] === 'embed' || segments[0] === 'live') {
      videoId = segments[1] || null
    }
  }

  if (!videoId || !/^[\w-]{6,}$/.test(videoId)) return null

  return {
    provider: 'youtube',
    providerLabel: 'YouTube',
    title: 'YouTube player',
    embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1`,
    aspectRatio: '16 / 9',
  }
}

function getSoundCloudEmbed(url: URL): MediaEmbedConfig | null {
  if (!hasHostname(url, 'soundcloud.com') && !hasHostname(url, 'on.soundcloud.com')) return null

  return {
    provider: 'soundcloud',
    providerLabel: 'SoundCloud',
    title: 'SoundCloud player',
    embedUrl: `https://w.soundcloud.com/player/?url=${encodeURIComponent(url.toString())}&color=%23ff5500&auto_play=false&hide_related=false&show_comments=true&show_user=true&show_reposts=false&show_teaser=true&visual=true`,
    minHeight: 352,
  }
}

function getVimeoEmbed(url: URL): MediaEmbedConfig | null {
  if (!hasHostname(url, 'vimeo.com') && !hasHostname(url, 'player.vimeo.com')) return null

  const segments = getPathSegments(url)
  const videoId = hasHostname(url, 'player.vimeo.com')
    ? (segments[1] || null)
    : (segments.find((segment) => /^\d+$/.test(segment)) || null)

  if (!videoId) return null

  return {
    provider: 'vimeo',
    providerLabel: 'Vimeo',
    title: 'Vimeo player',
    embedUrl: `https://player.vimeo.com/video/${videoId}?title=0&byline=0&portrait=0`,
    aspectRatio: '16 / 9',
  }
}

function getMixcloudEmbed(url: URL): MediaEmbedConfig | null {
  if (!hasHostname(url, 'mixcloud.com')) return null

  const segments = getPathSegments(url)
  if (segments.length < 2) return null

  const feed = url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`

  return {
    provider: 'mixcloud',
    providerLabel: 'Mixcloud',
    title: 'Mixcloud player',
    embedUrl: `https://www.mixcloud.com/widget/iframe/?hide_cover=0&light=1&feed=${encodeURIComponent(feed)}`,
    minHeight: 120,
  }
}

function getSpotifyEmbed(url: URL): MediaEmbedConfig | null {
  if (!hasHostname(url, 'open.spotify.com')) return null

  const segments = getPathSegments(url)
  const normalizedSegments = segments[0]?.startsWith('intl-') ? segments.slice(1) : segments
  const [type, id] = normalizedSegments
  const supportedTypes = new Set(['track', 'album', 'playlist', 'episode', 'show', 'artist'])

  if (!type || !id || !supportedTypes.has(type)) return null

  return {
    provider: 'spotify',
    providerLabel: 'Spotify',
    title: 'Spotify player',
    embedUrl: `https://open.spotify.com/embed/${type}/${id}?utm_source=generator`,
    minHeight: ['album', 'playlist', 'show', 'artist'].includes(type) ? 352 : 152,
  }
}

function getTidalEmbed(url: URL): MediaEmbedConfig | null {
  if (!hasHostname(url, 'tidal.com') && !hasHostname(url, 'listen.tidal.com')) return null

  const rawSegments = getPathSegments(url)
  const segments = rawSegments[0] === 'browse' ? rawSegments.slice(1) : rawSegments
  const [type, id] = segments
  const pathByType: Record<string, string> = {
    track: 'tracks',
    album: 'albums',
    playlist: 'playlists',
    video: 'videos',
    mix: 'mixes',
    artist: 'artists',
  }

  if (!type || !id || !pathByType[type]) return null

  return {
    provider: 'tidal',
    providerLabel: 'TIDAL',
    title: 'TIDAL player',
    embedUrl: `https://embed.tidal.com/${pathByType[type]}/${id}`,
    minHeight: type === 'track' ? 250 : 420,
  }
}

function getAppleMusicEmbed(url: URL): MediaEmbedConfig | null {
  if (!hasHostname(url, 'music.apple.com') && !hasHostname(url, 'embed.music.apple.com')) return null

  const segments = getPathSegments(url)
  if (segments.length < 2) return null

  return {
    provider: 'apple-music',
    providerLabel: 'Apple Music',
    title: 'Apple Music player',
    embedUrl: `https://embed.music.apple.com${url.pathname}${url.search}`,
    minHeight: url.searchParams.has('i') ? 175 : 450,
  }
}

const EMBED_BUILDERS = [
  getYouTubeEmbed,
  getSoundCloudEmbed,
  getMixcloudEmbed,
  getSpotifyEmbed,
  getTidalEmbed,
  getAppleMusicEmbed,
  getVimeoEmbed,
] as const

export function getMediaEmbedConfig(rawUrl: string): MediaEmbedConfig | null {
  const url = parseUrl(rawUrl)
  if (!url) return null

  for (const buildEmbed of EMBED_BUILDERS) {
    const embed = buildEmbed(url)
    if (embed) return embed
  }

  return null
}
