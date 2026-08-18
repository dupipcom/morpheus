/**
 * Clerk test-auth helpers for E2E.
 *
 * Users are created via the Clerk Backend API (CLERK_SECRET_KEY) with their
 * email marked verification-complete (bypassing the instance's code-based
 * verification requirement). Sign-in uses Clerk's official Playwright
 * testing helper (`clerk.signIn`, password strategy) against a page that has
 * loaded the Clerk provider; afterwards the app's middleware issues a real
 * `__session` cookie on the next navigation, which API-level tests harvest
 * for their request contexts. Requires a Clerk DEVELOPMENT instance.
 *
 * The app self-heals without webhooks: the middleware's profile bootstrap
 * (`/api/v1/user/ensure`) creates the internal User + Profile on first
 * navigation, and the wallet self-heal covers pre-Phase-6 users.
 */

import { createClerkClient } from '@clerk/backend'
import { clerk as testingClerk, clerkSetup } from '@clerk/testing/playwright'
import type { BrowserContext, Page } from '@playwright/test'

export interface TestUser {
  clerkUserId: string
  username: string
  email: string
  password: string
}

const TEST_PASSWORD = 'E2eTestPassword123!'

let counter = 0

function clerk() {
  const secretKey = process.env.CLERK_SECRET_KEY
  if (!secretKey) {
    throw new Error('CLERK_SECRET_KEY is required to run E2E tests')
  }
  return createClerkClient({ secretKey })
}

/** Create a fresh test user (unique username + verified email per run). */
export async function createTestUser(prefix = 'e2e'): Promise<TestUser> {
  const stamp = Date.now().toString(36)
  const n = ++counter
  const username = `${prefix}${stamp}${n}`
  // +-alias on the real domain: Clerk's email validator rejects .test TLDs.
  const email = `e2e+${username}@dupip.com`
  const user = await clerk().users.createUser({
    username,
    emailAddress: [email],
    password: TEST_PASSWORD,
    skipPasswordChecks: true
  })
  // Bypass the email-verification code requirement: mark the address
  // verification-complete via the Backend API (no user interaction).
  if (user.primaryEmailAddressId) {
    await clerk().emailAddresses.updateEmailAddress(user.primaryEmailAddressId, {
      verified: true
    })
  }
  return { clerkUserId: user.id, username, email, password: TEST_PASSWORD }
}

/**
 * Sign the page in as the user through Clerk's testing helper (password
 * strategy). Call after `page.goto()` on a page that loads the Clerk
 * provider; the helper navigates internally and waits for the session.
 */
export async function signInWithPassword(page: Page, user: TestUser): Promise<void> {
  await clerkSetup()
  await testingClerk.signIn({
    page,
    signInParams: {
      strategy: 'password',
      password: user.password,
      identifier: user.email
    }
  })
}

/**
 * Harvest the Clerk cookies from the browser context after sign-in, for
 * reuse in API request contexts. `auth()` needs the whole set — the session
 * JWT (`__session`), the testing bypass (`__clerk_db_jwt`, planted by
 * clerk.signIn) and `__client_uat` — individually they each yield 401.
 * Only the unsuffixed names are returned (the `_<instance>`-suffixed
 * variants are aliases of the same values).
 */
export async function getSessionCookie(context: BrowserContext): Promise<string> {
  const cookies = await context.cookies()
  const names = ['__session', '__clerk_db_jwt', '__client_uat']
  const harvested = names
    .map((name) => cookies.find((c) => c.name === name))
    .filter((c): c is NonNullable<typeof c> => Boolean(c))
    .map((c) => `${c.name}=${c.value}`)
  if (harvested.length < 3) {
    throw new Error(
      `Expected __session/__clerk_db_jwt/__client_uat cookies after sign-in, got: ${cookies
        .map((c) => c.name)
        .join(', ')}`
    )
  }
  return harvested.join('; ')
}

/** Best-effort cleanup of Clerk test users. */
export async function deleteTestUser(clerkUserId: string): Promise<void> {
  try {
    await clerk().users.deleteUser(clerkUserId)
  } catch (error) {
    console.warn(`Failed to delete test user ${clerkUserId}:`, error)
  }
}
