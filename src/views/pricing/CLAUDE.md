# PricingView - Public Pricing & DPIP Consent

## Purpose

The pricing feature renders the public `/pricing` page: a marketing hero (Dupip as a European webradio with a well-being mission, with a transparent note on the SIAE license status), the plan cards grid, and the DPIP section. The plans grid is **gated behind an explicit DPIP consent dialog**: the consent must be saved before the table is unblurred. Signed-out visitors are asked to sign in first.

## Files

| File | Role |
|---|---|
| `src/app/[locale]/pricing/page.tsx` | Server page: hero + SIAE note (server-rendered for SEO), mounts the client view |
| `pricingView.tsx` | Client feature: consent state, gating, consent dialog, plans grid, DPIP card |
| `dpipSection.tsx` | Presentational DPIP story card (props: isLoaded, isSignedIn, consentedOn) |

## Component Architecture

```
/pricing page (server)
├── Hero (heroTitle, heroSubtitle, SIAE note)
└── PricingView (client)
    ├── Plans grid — <PricingTable for="user" /> blurred + pointer-events-none while blocked
    ├── DpipSection — DPIP story card + status (signed-out notice / consent recorded date)
    └── AlertDialog (non-dismissible while gated)
        ├── Signed-out → SignInButton (returns to /pricing via fallbackRedirectUrl)
        └── Signed-in → Checkbox + Save consent → POST /api/v1/user → refreshUser() → dialog closes
```

Gating logic: `gated = isLoaded && (isSignedIn ? (sessionReady && !hasConsented) : true)`; blocked also while Clerk/auth or the user doc is still loading (avoids a consent dialog flash for consented users).

## Plan Data Source

Plan names, tiers, monthly/yearly values and features come **from the Clerk dashboard** — there is no plan catalog mirrored in code. The table is client-mounted (Clerk early-access component); hero copy is server-rendered so SEO does not depend on it. After checkout, users land on `/{locale}/app/profile` (`newSubscriptionRedirectUrl`).

Feature gating elsewhere in the app uses Clerk feature keys via `useFeatureFlag()` (`useAuth().has({ feature: 'ai_assistant' })`) — plan↔feature mapping also lives in the Clerk dashboard.

## Consent System

- Checks `user.consents.dpipNoMonetaryValue.consentedOn` for prior consent
- Stores consent via `POST /api/v1/user` with `consents.dpipNoMonetaryValue` (`consentedOn` + the localized checkbox text as `consentQuestion`)
- The route merges consents generically (`{ set: { ...(user.consents || {}), ...data.consents } }`) — no API change needed for new consent keys
- The consent **gates the plans grid**: dialog is non-dismissible (`onOpenChange` no-op) while gated; grid is blurred + pointer-events-none until consent is saved
- Signed-out visitors see a Sign-in prompt in the dialog instead of the checkbox; after sign-in they return to `/pricing` via `fallbackRedirectUrl`

## State Management

- `useAuth()` (`@clerk/clerk-react`) for auth state — `session.user` from `GlobalContext` is `{}` until loaded
- `useUserData(isLoaded && !!isSignedIn)` for `refreshUser()` after consent save (disabled when signed out to avoid a 401 fetch on the public page)
- i18n via `useI18n()` (`pricing.*` keys, backfilled to all locales via `scripts/sync-locales-from-en.js`)

## Correlations

| Related To | Relationship |
|---|---|
| **Clerk dashboard** | Source of truth for plans, tiers, prices, features |
| **`useFeatureFlag`** | Existing pattern for gating features by Clerk plan features |
| **`POST /api/v1/user`** | Consent storage (generic `consents` merge) |
| **`InvestView`** | Precedent for the consent checkbox flow |
| **`balanceSection`** | Displays the DPIP stash (`Ð`) that this page pitches |

## Future Work

- DPIP stash time-based accrual mechanics (fields exist on `User`: `stash`, `profit`, `equity`, `withdrawn`, `availableBalance`)
- Rendering the signed-in user's live stash inside the DPIP card
- Gating more features via Clerk feature keys as plans evolve
