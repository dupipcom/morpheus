/**
 * Voicemail inbox E2E (phase 12): seeds a voicemail for a fresh test user,
 * signs in, opens /app/chat/voicemails and verifies the message renders
 * (caller + summary), then exercises the read-state API.
 */

import { test, expect } from '@playwright/test'
import {
  createTestUser,
  deleteTestUser,
  signInWithPassword,
  type TestUser,
} from './helpers/auth'
import { prisma, cleanupInternalUsers } from './helpers/ledger'

test.describe.serial('voicemail inbox', () => {
  test.describe.configure({ timeout: 180_000 })

  let user: TestUser
  let internalUserId: string
  let voicemailId: string

  test.beforeAll(async () => {
    user = await createTestUser('e2evoicemail')

    // The internal User row is normally bootstrapped on first app visit —
    // create it here so the voicemail can be seeded before any navigation.
    let internal = await prisma.user.findUnique({
      where: { userId: user.clerkUserId },
      select: { id: true },
    })
    if (!internal) {
      internal = await prisma.user.create({
        data: { userId: user.clerkUserId, email: user.email },
      })
    }
    internalUserId = internal.id

    const voicemail = await prisma.voicemail.create({
      data: {
        targetUserId: internalUserId,
        callerPhone: '+15551234567',
        callerName: 'E2E Caller',
        callerVerified: true,
        transcript: 'Hey, this is the e2e caller. Hope your week was great!',
        summary: 'E2E Caller says hi and hopes the week went well.',
        source: 'AI_ASSISTANT',
      },
    })
    voicemailId = voicemail.id
  })

  test.afterAll(async () => {
    await prisma.voicemail.deleteMany({ where: { id: voicemailId } })
    await cleanupInternalUsers([user.clerkUserId])
    await deleteTestUser(user.clerkUserId)
    await prisma.$disconnect()
  })

  test('voicemail inbox renders the seeded message', async ({ page }) => {
    await page.goto('/en/app/chat/voicemails')
    await signInWithPassword(page, user)
    await page.goto('/en/app/chat/voicemails')

    await expect(page.getByText('E2E Caller').first()).toBeVisible()
    await expect(
      page.getByText('E2E Caller says hi and hopes the week went well.'),
    ).toBeVisible()
    await expect(page.getByText('Hey, this is the e2e caller. Hope your week was great!')).toBeVisible()
  })

  test('voicemail read-state flows through the API', async ({ page }) => {
    // The previous test opened the inbox, which auto-marks everything read —
    // reset the seeded voicemail so this test exercises the unread → read path.
    await prisma.voicemail.updateMany({
      where: { id: voicemailId },
      data: { readAt: null },
    })

    await page.goto('/en/app/chat')
    await signInWithPassword(page, user)

    const request = page.context().request

    const listResponse = await request.get('/api/v1/voicemails')
    expect(listResponse.ok()).toBeTruthy()
    const list = await listResponse.json()
    const seeded = list.voicemails.find((v: { id: string }) => v.id === voicemailId)
    expect(seeded).toBeTruthy()
    expect(seeded.readAt).toBeNull()

    const patchResponse = await request.patch(`/api/v1/voicemails/${voicemailId}`)
    expect(patchResponse.ok()).toBeTruthy()

    const after = await (await request.get('/api/v1/voicemails')).json()
    const updated = after.voicemails.find((v: { id: string }) => v.id === voicemailId)
    expect(updated.readAt).not.toBeNull()
    expect(after.unreadCount).toBe(0)
  })
})
