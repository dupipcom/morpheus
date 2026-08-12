# Link Preview API

## Route
`GET /api/v1/link-preview?url=`

## Auth
Public. No auth required.

## Purpose
Fetches Open Graph / Twitter card metadata for a URL, with SSRF protection.

## Behavior
1. Validates `url` is `http`/`https`.
2. Resolves the hostname and rejects private/loopback/link-local addresses (SSRF guard).
3. Fetches up to `MAX_HTML_BYTES` (500 KB), stopping after `</head>`.
4. Extracts `og:*`, `twitter:*`, `title`, `description`, `image`, and `favicon`.
5. Returns a `LinkPreviewData` object with `Cache-Control`.

## Response
`{ url, title, description, image, favicon, siteName }`.

## Errors
- `400`: missing/invalid URL, non-http(s) protocol, or disallowed private host.

## Notes
`FETCH_TIMEOUT_MS = 10s`. Fallback preview uses hostname when fetch fails.
