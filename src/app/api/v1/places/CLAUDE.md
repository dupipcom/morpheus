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
Proxies the [Place Autocomplete](https://developers.google.com/maps/documentation/places/web-service/autocomplete)
JSON API.

**Params:** `input` (required, 1–200 chars after trim → else 400), `sessionToken` (optional,
truncated to 100 chars, forwarded as `sessiontoken`).

**Response:** `{ predictions: [{ placeId, description }] }` — up to 5 predictions.

**Errors:** 400 invalid/missing `input`, 401, 429 rate limited, 502 upstream failure,
503 `GOOGLE_PLACES_API_KEY` unset.

## Details
Proxies the [Place Details](https://developers.google.com/maps/documentation/places/web-service/details)
JSON API with `fields=geometry,name,formatted_address`.

**Params:** `placeId` (required, ≤ 200 chars → else 400), `sessionToken` (optional, forwarded as
`sessiontoken`).

**Response:** `{ location: { lat, lng, placeId, name, address } }` — the canonical location JSON
used by `PlaceLocation` everywhere (placePicker, notes, jobs, events).

**Errors:** 400 missing/invalid `placeId`, 401, 404 place not found, 502 upstream failure,
503 key unset.

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
