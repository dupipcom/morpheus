# Places API

Google Places proxy routes. These are the only place in the codebase that read
`GOOGLE_PLACES_API_KEY` — the key is **server-only** (set in `.env.local`, default empty in
`.env.public`), never `NEXT_PUBLIC_`, never returned to clients, never logged (upstream logs
report status codes only). Clients reach Places exclusively through these routes, so the key
never enters the browser bundle.

## Routes
- `GET /api/v1/places/autocomplete?input=&sessionToken=`
- `GET /api/v1/places/details?placeId=&sessionToken=`
- `GET /api/v1/places/geocode?lat=&lng=` — reverse-geocode coordinates into `{ lat, lng, placeId, name, address }` (LRU 5 min, per-user rate limit 30/10min)
- `GET /api/v1/places/staticmap?lat=&lng=&zoom=&size=`

## Auth
All four require Clerk auth (`auth()` from `@clerk/nextjs/server`) → `401 { error: 'Unauthorized' }`
when the session is missing. `GET` requests from `<img>` tags send cookies, so `locationMap`
renders fine against the staticmap route.

## Autocomplete
Proxies the [Places API (New) Autocomplete](https://developers.google.com/maps/documentation/places/web-service/place-autocomplete)
endpoint (`POST https://places.googleapis.com/v1/places:autocomplete`) — NOT the legacy
`maps.googleapis.com/maps/api/place/autocomplete/json`, which Google has discontinued and
which rejects HTTP-referer-restricted API keys outright.

**Params:** `input` (required, 1–200 chars after trim → else 400), `sessionToken` (optional,
truncated to 100 chars, forwarded as `sessionToken`).

**Field mask:** `suggestions.placePrediction.placeId,suggestions.placePrediction.text` — verified
against the live API: on `:autocomplete` only the suggestion subfield paths validate (`places.*`
paths are rejected by mask validation).

**Response:** `{ predictions: [{ placeId, description }] }` — up to 5 predictions
(`placePrediction.placeId` + `placePrediction.text.text` upstream).

**Errors:** 400 invalid/missing `input`, 401, 429 rate limited, 502 upstream failure
(upstream status/message logged server-side), 503 `GOOGLE_PLACES_API_KEY` unset.

## Details
Proxies the [Places API (New) Place Details](https://developers.google.com/maps/documentation/places/web-service/place-details)
endpoint (`GET https://places.googleapis.com/v1/places/{placeId}`) with
`X-Goog-FieldMask: id,displayName,formattedAddress,location` — the bare field names, verified
against the live API (the docs' `places.`-prefixed forms are rejected by mask validation).

**Params:** `placeId` (required, ≤ 200 chars → else 400), `sessionToken` (optional, forwarded as
`sessionToken`).

**Response:** `{ location: { lat, lng, placeId, name, address } }` — the canonical location JSON
used by `PlaceLocation` everywhere (placePicker, notes, jobs, events).

**Errors:** 400 missing/invalid `placeId`, 401, 404 place not found (upstream 404 or missing
geometry), 502 upstream failure, 503 key unset.

## API key & referer forwarding

`GOOGLE_PLACES_API_KEY` is **HTTP-referer restricted** in Google Cloud Console. Google only
accepts referer-restricted keys from a browser context, so every upstream call in these four
routes echoes the incoming request's `Referer` (fallback `Origin`) header — server-side
requests have no referer of their own and would be rejected with
`API_KEY_HTTP_REFERRER_BLOCKED` otherwise. Requirements:

- The key must have **Places API (New)** (and Maps Static API / Geocoding API for
  staticmap/geocode) enabled.
- The key's HTTP referer allow-list must include the origins the app actually runs on
  (e.g. `https://www.dupip.com/*`, `https://beta.dupip.com/*`, `http://localhost:3000/*`).
  If the list doesn't cover the calling origin, the proxy returns 502 with the upstream
  error logged. (An IP-restricted or unrestricted server-side key would also work.)

## Staticmap
Proxies the [Static Maps](https://developers.google.com/maps/documentation/maps-static/start)
API so the key stays server-side. Returns the raw image bytes with the upstream `Content-Type`
and `Cache-Control: public, max-age=86400` (+ `X-Content-Type-Options: nosniff`).

**Params:** `lat` (required, −90..90 → else 400), `lng` (required, −180..180 → else 400),
`zoom` (optional, default 14, clamped to 1–20, non-numeric → 400), `size` (optional, whitelist:
`640x360` only → else 400). Marker: `color:red|lat,lng`.

**Errors:** 400 invalid params, 401, 429 rate limited, 502 upstream failure, 503 key unset.

## Quota controls
Google Places is billed per call, so all three routes enforce the same controls:

- **5 results max** per autocomplete response (client fetches at most 5 too).
- **In-memory LRU cache** (`Map`, cap ~200 entries, 5-min TTL). Autocomplete key =
  `input|sessionToken`; details key = `placeId`. Per-process only — fine for quota smoothing,
  not a distributed cache.
- **Per-user rate limit** (in-memory `Map` userId → timestamps, max 30 requests per 10 minutes
  → `429 { error: 'Too many requests', code: 'RATE_LIMITED' }`).

## Consumers
- `src/components/placePicker.tsx` — autocomplete + details
- `src/components/locationMap.tsx` — staticmap (`<img>` / next/image `unoptimized`)
