/**
 * Legacy events redirect shim (Phase 8)
 *
 * The old `/api/v1/events` served LIFE events; that API now lives at
 * `/api/v1/life-events`. This shim redirects any out-of-tree caller and is
 * documented as removed next release.
 */

import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url)
  url.pathname = '/api/v1/life-events'
  return NextResponse.redirect(url)
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url)
  url.pathname = '/api/v1/life-events'
  return NextResponse.redirect(url, { status: 307 })
}
