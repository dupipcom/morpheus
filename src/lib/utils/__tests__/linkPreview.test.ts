import test from 'node:test'
import assert from 'node:assert/strict'
import { extractUrls, getMediaEmbedConfig } from '../linkPreview'

test('extractUrls returns unique matches in order of appearance', () => {
  const content = 'See https://example.com and https://youtu.be/dQw4w9WgXcQ then https://example.com again.'

  assert.deepEqual(extractUrls(content), [
    'https://example.com',
    'https://youtu.be/dQw4w9WgXcQ',
  ])
})

test('getMediaEmbedConfig detects supported providers and builds embed URLs', () => {
  const expectations = [
    {
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      provider: 'youtube',
      embedUrl: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&modestbranding=1',
    },
    {
      url: 'https://soundcloud.com/forss/flickermood',
      provider: 'soundcloud',
      embedUrlStartsWith: 'https://w.soundcloud.com/player/?url=',
    },
    {
      url: 'https://vimeo.com/76979871',
      provider: 'vimeo',
      embedUrl: 'https://player.vimeo.com/video/76979871?title=0&byline=0&portrait=0',
    },
    {
      url: 'https://www.mixcloud.com/NTSRadio/floating-points-14th-october-2023/',
      provider: 'mixcloud',
      embedUrl: 'https://www.mixcloud.com/widget/iframe/?hide_cover=0&light=1&feed=%2FNTSRadio%2Ffloating-points-14th-october-2023%2F',
    },
    {
      url: 'https://open.spotify.com/track/7ouMYWpwJ422jRcDASZB7P',
      provider: 'spotify',
      embedUrl: 'https://open.spotify.com/embed/track/7ouMYWpwJ422jRcDASZB7P?utm_source=generator',
    },
    {
      url: 'https://tidal.com/browse/track/123456',
      provider: 'tidal',
      embedUrl: 'https://embed.tidal.com/tracks/123456',
    },
    {
      url: 'https://music.apple.com/us/album/evermore-deluxe-version/1547315522?i=1547315734',
      provider: 'apple-music',
      embedUrl: 'https://embed.music.apple.com/us/album/evermore-deluxe-version/1547315522?i=1547315734',
    },
  ] as const

  for (const expectation of expectations) {
    const embed = getMediaEmbedConfig(expectation.url)

    assert.ok(embed)
    assert.equal(embed.provider, expectation.provider)

    if ('embedUrl' in expectation) {
      assert.equal(embed.embedUrl, expectation.embedUrl)
    }

    if ('embedUrlStartsWith' in expectation) {
      assert.ok(embed.embedUrl.startsWith(expectation.embedUrlStartsWith))
    }
  }
})

test('getMediaEmbedConfig returns null for unsupported URLs', () => {
  assert.equal(getMediaEmbedConfig('https://example.com/article'), null)
})
