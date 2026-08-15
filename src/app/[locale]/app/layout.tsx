import { ReactNode } from 'react'
import { auth } from '@clerk/nextjs/server'
import { ensureUserAndProfile } from '@/lib/services/user/ensureUserAndProfile'

interface AppLayoutProps {
  children: ReactNode
}

/**
 * Backstop for the middleware-layer profile bootstrap. The middleware kicks a
 * fire-and-forget `POST /api/v1/user/ensure`, but the very first authenticated
 * request may race that call. This server-component layout awaits the same
 * idempotent helper before rendering any `/app/*` page, so downstream code can
 * assume the caller has both a `User` row and a public `Profile`.
 *
 * Cheap when both already exist (two indexed lookups).
 */
export default async function AppLayout({ children }: AppLayoutProps) {
  const { userId } = await auth()
  if (userId) {
    await ensureUserAndProfile(userId)
  }
  return <>{children}</>
}
