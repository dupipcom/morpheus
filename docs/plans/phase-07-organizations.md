# Phase 7 — Organizations

**Goal:** organizations become first-class owners — org profiles, org lists (and therefore org job
boards), org wallets and, in Phase 8, org events. Clerk Organizations stay the identity and
membership source of truth; Prisma gets a mirror so we can join and index locally.

Today: `ChatOrgMembership { clerkOrgId, userId, role }` + Clerk orgs power chat only. `Profile` and
`List` are strictly user-scoped. `useFeatureFlag` treats membership of the Clerk org `dupip` as
premium.

## 7.1 Model

```prisma
model Organization {
  id          String   @id @default(auto()) @map("_id") @db.ObjectId
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  clerkOrgId  String   @unique
  slug        String   @unique             // always present (no sparse unique on Mongo)
  name        String
  imageUrl    String?
  bio         String?
  links       Json?
  location    Json?
  publicVisible Boolean @default(false)
  verified    Boolean  @default(false)
  status      String   @default("ACTIVE")  // ACTIVE | ORPHANED (deleted in Clerk) | ARCHIVED
  deletedAt   DateTime?
  createdByUserId String @db.ObjectId
  members     OrgMembership[]
  lists       List[]
  wallets     Wallet[]
  @@index([publicVisible])
  @@index([status])
}

model OrgMembership {
  id        String   @id @default(auto()) @map("_id") @db.ObjectId
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  orgId     String   @db.ObjectId
  org       Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  userId    String   @db.ObjectId
  user      User     @relation("OrgMemberships", fields: [userId], references: [id], onDelete: Cascade)
  role      String   @default("MEMBER")  // OWNER | ADMIN | MANAGER | MEMBER | STAFF
  clerkOrgId String
  @@unique([orgId, userId])
  @@index([userId])
}
```

Polymorphic owner added to `List` and `Wallet` (and `Event` in Phase 8, which declares the
`Organization.events` inverse there — not here, since that model doesn't exist yet):

```prisma
ownerType String  @default("USER")  // USER | ORG
orgId     String? @db.ObjectId
org       Organization? @relation(fields: [orgId], references: [id])
@@index([ownerType, orgId])
```

**`Profile` is deliberately untouched.** `Profile.userId` is required and `@unique`, so an org
cannot own a `Profile` without breaking the personal-profile invariant. **The `Organization` row
*is* the org's public profile** — it carries `slug`, `bio`, `links`, `location`, `imageUrl` — and
`/org/[slug]` renders from it. No `Profile` row is created for orgs, and nothing in the feed
assumes one (org-authored content resolves its display identity through `ownerType`).

`userId` stays required on owned rows and means **creator/steward** even for org-owned data, so
existing queries keep working and audit trails survive a membership change.

`ChatOrgMembership` is **not** deleted in this phase: `OrgMembership` becomes the general model and
a migration copies rows across; chat continues reading its own model until a follow-up removes it.
Both are kept in sync by the same webhook handler.

`STAFF` is the role used by Phase 10's door scanner.

## 7.2 Clerk sync

- `POST /api/v1/webhooks/clerk` (extend the existing `/api/v1/auth` handler or split it — split
  recommended, keeping signature verification shared) handles
  `organization.created|updated|deleted` and
  `organizationMembership.created|updated|deleted` → upserts `Organization` / `OrgMembership`.
  Idempotent upserts keyed on `clerkOrgId` / `(clerkOrgId, userId)`.
- `syncOrganization(clerkOrgId)` in `src/lib/services/org/orgService.ts` is a pull-based repair used
  on demand when a request references an org we haven't mirrored yet (webhook loss tolerance).
- Org creation via `POST /api/v1/chat/orgs` is generalised to `POST /api/v1/orgs` (chat keeps a
  thin alias): creates the Clerk org, the mirror, the `OWNER` membership, the default `general`
  chat channel and the org's default wallet (`kind: 'ORG'`, Phase 6).

## 7.3 Ownership kit gains the ORG branch

Phase 3's `ownershipService` is extended in one place:

```
getViewerRole(viewer, kind, entity):
  entity.ownerType === 'ORG'
    ? mapOrgRole(await orgMembership(viewer, entity.orgId))   // OWNER/ADMIN → OWNER, MANAGER → MANAGER, MEMBER → COLLABORATOR, STAFF → STAFF
    : existing user/UserReference logic
```

Every route that already calls `assertCan` inherits org support with no edits — that is the payoff
of Phase 3.

## 7.4 API

| Endpoint | Notes |
|----------|-------|
| `GET /api/v1/orgs` | Orgs the viewer belongs to (with role). |
| `POST /api/v1/orgs` | Create (Clerk + mirror + wallet + channel). |
| `GET/PUT /api/v1/orgs/[orgId]` | Detail / update public profile fields (OWNER/ADMIN). |
| `GET /api/v1/orgs/[orgId]/members` · `POST` · `DELETE .../[userId]` | Membership management, proxied to Clerk then mirrored. |
| `GET /api/v1/orgs/public/[slug]` | Public org profile: bio, links, location, published lists, upcoming events (Phase 8), like count. |
| `POST /api/v1/tasklists` | Accepts `ownerType: 'ORG', orgId` — requires MANAGER+ in that org. |
| `GET /api/v1/tasklists?scope=me\|org:<id>\|all` | Scoped listing. |

## 7.5 UI

- **Org switcher** in the app shell: reuse Clerk's `useOrganizationList`; selecting an org sets an
  `activeOrgId` in `GlobalContext` + a cookie, which scopes the Do list picker, the Be composer's
  "post as", and the event creation form (Phase 8).
- `src/app/[locale]/app/be/organizations/page.tsx` — currently a disabled tab; becomes the org
  directory + "create organization" + per-org card (members, lists, events).
- `src/app/[locale]/org/[slug]/page.tsx` — public org profile, built on the Phase 3 public-page kit
  with `buildMetadata(..., type: 'org')`.
- `addListForm.tsx` — an owner selector (Me / each org where the viewer is MANAGER+) shown only when
  the user has org memberships.

## Migrations

- `0025-mirror-clerk-organizations.js` — pull all Clerk orgs + memberships (paginated), upsert
  `Organization`/`OrgMembership`, copy from `ChatOrgMembership` where Clerk is unreachable, seed
  slugs and default org wallets.
- `0026-backfill-owner-type.js` — set `ownerType: 'USER'` on every existing `List` and `Wallet`
  (defaults cover new rows; this normalises old ones for index use).

## Verification

- Create an org in-app → Clerk org exists, mirror row exists, creator is OWNER, org wallet created,
  `general` channel created.
- Add/remove a member in the Clerk dashboard → webhook updates `OrgMembership` within seconds;
  re-delivering the same event changes nothing.
- Create an org list → it appears for every MANAGER+ of the org, not in personal scope; a MEMBER can
  view but not edit; a non-member gets 403 on edit and 404 on private read.
- Publish an org list → the public list page shows the **org** as owner, not the creator.
- Delete an org in Clerk → the mirror is marked `status: 'ORPHANED'` with `deletedAt` set; its lists
  and events are retained and readable by their steward, no route 500s, and the public org page
  404s.
