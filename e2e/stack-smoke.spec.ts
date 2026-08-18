/**
 * Whole-stack smoke (plan step 3, API-level E2E):
 *   signup (default wallet) → treasury credit → transfer A→B (balances + 2
 *   entries) → org create (org wallet) → org list publish → job apply/accept
 *   → event create/publish/rsvp → event↔list link → life-events vs events →
 *   ledger invariants (ΣDEBIT−ΣCREDIT=0, balance === latest balanceAfter).
 *
 * Runs against the API over real HTTP with Clerk sessions (helpers/auth.ts).
 * The treasury credit is issued by the harness (the Phase 11 allowance cron
 * has no endpoint yet) using the same invariant-respecting writes.
 */

import { test, expect } from '@playwright/test'
import {
  createTestUser,
  signInWithPassword,
  deleteTestUser,
  type TestUser
} from './helpers/auth'
import {
  prisma,
  ensureTreasury,
  creditMinor,
  createDocument,
  checkLedgerInvariants,
  cleanupInternalUsers
} from './helpers/ledger'

const BASE = 'http://localhost:3000'
const MINOR = (dpip: number) => Math.round(dpip * 100)

test.describe.serial('stack smoke', () => {
  // The chain spans two Clerk sign-ins + a dozen API round-trips — allow it
  // well beyond the default 120s test timeout.
  test.describe.configure({ timeout: 300_000 })

  let userA: TestUser
  let userB: TestUser
  let clerkIds: string[] = []

  test.beforeAll(async () => {
    userA = await createTestUser('e2esmokea')
    userB = await createTestUser('e2esmokeb')
    clerkIds = [userA.clerkUserId, userB.clerkUserId]
  })

  test.afterAll(async () => {
    for (const id of clerkIds) await deleteTestUser(id)
    await cleanupInternalUsers(clerkIds)
    await prisma.$disconnect()
  })

  test('signup → wallet → transfer → orgs → jobs → events → invariants', async ({ browser }) => {
    // ---- sign in both users in the browser. API calls go through
    // `context.request`, which SHARES the browser cookie jar — Clerk's
    // middleware rotates `__session` on each response and Playwright keeps
    // the jar updated, so tokens never go stale mid-test.
    const signIn = async (user: TestUser) => {
      const context = await browser.newContext()
      const page = await context.newPage()
      await page.goto('/')
      await signInWithPassword(page, user)
      await page.goto('/en/app/profile') // middleware sets the session cookies
      return { context, page, request: context.request }
    }
    const sessionA = await signIn(userA)
    const sessionB = await signIn(userB)
    const requestA = sessionA.request
    const requestB = sessionB.request

    // ---- signup: default wallet self-heals (Phase 6)
    const walletsResA = await requestA.get('/api/v1/wallet')
    expect(walletsResA.ok(), `${walletsResA.status()}: ${await walletsResA.text()}`).toBeTruthy()
    const walletsA = (await walletsResA.json()).wallets as any[]
    const defaultWalletA = walletsA.find((w) => w.isDefault)
    expect(defaultWalletA).toBeTruthy()

    const userRowA = await prisma.user.findUniqueOrThrow({ where: { userId: userA.clerkUserId } })

    // ---- treasury credit: 25 DPIP to A (harness = Phase 11 cron)
    await ensureTreasury(userRowA.id)
    await creditMinor({
      toWalletId: defaultWalletA.id,
      amountMinor: MINOR(25),
      actorUserId: userRowA.id,
      reference: `e2e-smoke-credit-${Date.now()}`
    })

    // ---- transfer A → B by @username (5 DPIP)
    const transferRes = await requestA.post('/api/v1/wallet/transfer', {
      data: {
        fromWalletId: defaultWalletA.id,
        toUsername: `@${userB.username}`,
        amount: 5
      }
    })
    expect(transferRes.ok(), await transferRes.text()).toBeTruthy()

    // Replay the same reference → same transaction, no double movement
    const transferBody = await transferRes.json()
    const replayRes = await requestA.post('/api/v1/wallet/transfer', {
      data: {
        fromWalletId: defaultWalletA.id,
        toUsername: `@${userB.username}`,
        amount: 5,
        reference: transferBody.transaction.reference
      }
    })
    expect(replayRes.ok()).toBeTruthy()
    const replayBody = await replayRes.json()
    expect(replayBody.transaction.id).toBe(transferBody.transaction.id)

    // Balances: A = 20, B = 5 (minor units)
    const walletsAfter = (await (await requestA.get('/api/v1/wallet')).json()).wallets as any[]
    const walletAAfter = walletsAfter.find((w) => w.id === defaultWalletA.id)
    expect(walletAAfter.balance).toBe(MINOR(20))

    const walletsB = (await (await requestB.get('/api/v1/wallet')).json()).wallets as any[]
    const walletB = walletsB.find((w) => w.isDefault)
    expect(walletB.balance).toBe(MINOR(5))

    // Statement: 2 entries for A (credit + debit), balanceAfter ends at 20
    const statementRes = await requestA.get(`/api/v1/wallet/${defaultWalletA.id}/statement`)
    expect(statementRes.ok()).toBeTruthy()
    const statement = await statementRes.json()
    expect(statement.entries.length).toBe(2)
    expect(statement.entries[0].balanceAfter).toBe(MINOR(20)) // newest first

    // ---- org create (org wallet) — Phase 7
    const orgName = `E2E Org ${Date.now().toString(36)}`
    const orgRes = await requestA.post('/api/v1/orgs', {
      data: { name: orgName }
    })
    expect(orgRes.ok(), await orgRes.text()).toBeTruthy()
    const org = (await orgRes.json()).organization as { id: string; clerkOrgId: string }
    expect(org.id).toBeTruthy()

    const walletsAfterOrg = (await (await requestA.get('/api/v1/wallet')).json()).wallets as any[]
    expect(walletsAfterOrg.some((w) => w.kind === 'ORG' && w.orgId === org.id)).toBeTruthy()

    // ---- org list publish (org job board) — Phase 5 + 7
    const listRes = await requestA.post('/api/v1/tasklists', {
      data: {
        name: 'E2E Org Job Board',
        ownerType: 'ORG',
        orgId: org.id,
        visibility: 'PUBLIC',
        publicVisible: true,
        jobBoardEnabled: true
      }
    })
    expect(listRes.ok(), await listRes.text()).toBeTruthy()
    const list = (await listRes.json()).taskList as any
    expect(list.ownerType).toBe('ORG')

    // Public task on the board
    const taskRes = await requestA.post('/api/v1/tasks', {
      data: {
        name: 'E2E Job Opening',
        listId: list.id,
        visibility: 'PUBLIC',
        jobDescription: 'Join the E2E test crew',
        requirements: 'Playwright experience',
        openings: 2,
        applyBy: '2099-12-31'
      }
    })
    expect(taskRes.ok(), await taskRes.text()).toBeTruthy()
    const task = (await taskRes.json()).task as any

    // ---- job apply (B) → accept (A) — Phase 5
    const applyRes = await requestB.post(`/api/v1/tasks/${task.id}/apply`, {
      data: { message: 'I am a great E2E candidate' }
    })
    expect(applyRes.ok(), await applyRes.text()).toBeTruthy()
    const application = (await applyRes.json()).application as any
    expect(application.status).toBe('PENDING')

    // Double apply → 409
    const doubleApplyRes = await requestB.post(`/api/v1/tasks/${task.id}/apply`, {
      data: { message: 'again' }
    })
    expect(doubleApplyRes.status()).toBe(409)

    // Accept as the list owner (A)
    const acceptRes = await requestA.post(`/api/v1/tasks/${task.id}/applications/${application.id}`, {
      data: { status: 'ACCEPTED' }
    })
    expect(acceptRes.ok(), await acceptRes.text()).toBeTruthy()

    // B is now a list collaborator
    const listDetail = (await (await requestA.get(`/api/v1/tasklists/${list.id}`)).json()).taskList as any
    const userRowB = await prisma.user.findUniqueOrThrow({ where: { userId: userB.clerkUserId } })
    expect((listDetail.users as any[]).some((u) => u.userId === userRowB.id)).toBeTruthy()

    // ---- event create → publish → rsvp → link list — Phase 8
    const cover = await createDocument(userRowA.id)
    const startsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    const eventRes = await requestA.post('/api/v1/events', {
      data: {
        name: 'E2E Launch Party',
        summary: 'The E2E test event',
        startsAt,
        isOnline: true,
        onlineUrl: 'https://e2e.example.com/party',
        visibility: 'PUBLIC',
        ownerType: 'ORG',
        orgId: org.id,
        coverDocumentId: cover.id
      }
    })
    expect(eventRes.ok(), await eventRes.text()).toBeTruthy()
    const event = (await eventRes.json()).event as any
    expect(event.publicUrl).toBeTruthy()

    // Draft is not publicly visible
    const draftPublicRes = await requestA.get(`/api/v1/events/public/${event.publicUrl}`)
    expect(draftPublicRes.status()).toBe(404)

    // Publish
    const publishRes = await requestA.post(`/api/v1/events/${event.id}/publish`)
    expect(publishRes.ok(), await publishRes.text()).toBeTruthy()

    // RSVP as B (idempotent: twice = same counts)
    for (let i = 0; i < 2; i++) {
      const rsvpRes = await requestB.post(`/api/v1/events/${event.id}/rsvp`, {
        data: { status: 'GOING' }
      })
      expect(rsvpRes.ok()).toBeTruthy()
    }
    const publicEvent = (await (await requestA.get(`/api/v1/events/public/${event.publicUrl}`)).json()).event as any
    expect(publicEvent.counts.going).toBe(1)
    expect(publicEvent.host.type).toBe('ORG')

    // Link the org list to the event (m:m)
    const linkRes = await requestA.post(`/api/v1/events/${event.id}/lists`, {
      data: { listId: list.id }
    })
    expect(linkRes.ok(), await linkRes.text()).toBeTruthy()
    const publicEventAfterLink = (await (await requestA.get(`/api/v1/events/public/${event.publicUrl}`)).json()).event as any
    expect((publicEventAfterLink.lists as any[]).some((l) => l.id === list.id)).toBeTruthy()

    // ---- life events vs public events (Phase 8 split)
    const lifeEventRes = await requestA.post('/api/v1/life-events', {
      data: { name: 'E2E Got Married' }
    })
    expect(lifeEventRes.ok(), await lifeEventRes.text()).toBeTruthy()

    const lifeEvents = (await (await requestA.get('/api/v1/life-events')).json()).lifeEvents as any[]
    expect(lifeEvents.some((e) => e.name === 'E2E Got Married')).toBeTruthy()

    const myEvents = (await (await requestA.get('/api/v1/events?scope=mine')).json()).events as any[]
    expect(myEvents.some((e) => e.name === 'E2E Got Married')).toBeFalsy()

    // Legacy shim redirects to the life-events API
    const legacyRes = await requestA.get('/api/v1/events/legacy')
    expect(legacyRes.url()).toContain('/api/v1/life-events')
    expect(legacyRes.ok()).toBeTruthy()

    // ---- ledger invariants
    const invariants = await checkLedgerInvariants()
    expect(invariants.balanced, `ΣDEBIT−ΣCREDIT ≠ 0 (${invariants.debitSum} vs ${invariants.creditSum})`).toBeTruthy()
    expect(invariants.balanceMismatches).toEqual([])

    await sessionA.context.close()
    await sessionB.context.close()
  })
})
