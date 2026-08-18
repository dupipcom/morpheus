/**
 * Ledger reconciliation cron (Phase 6)
 *
 * GET (authorized): sweep abandoned PENDING transactions, alarm on corruption,
 * and verify the ledger invariants (ΣDEBIT − ΣCREDIT = 0, wallet.balance ===
 * latest balanceAfter). Divergence is reported — never silently rewritten.
 */

import { NextRequest, NextResponse } from 'next/server'
import { reconcile } from '@/lib/services/ledger'
import { isAuthorizedCronRequest } from '@/lib/chat/unreadChatEmailNotifications'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const maxDuration = 120

export async function GET(request: NextRequest) {
  try {
    if (!isAuthorizedCronRequest(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const report = await reconcile()

    return NextResponse.json({ report })
  } catch (error) {
    console.error('Error running ledger reconciliation:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
