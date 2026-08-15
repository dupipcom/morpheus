import { NextRequest, NextResponse } from 'next/server'

import { getAuthenticatedUser } from '@/lib/services/auth'
import {
  assignNumber,
  disableNumber,
  getVirtualNumbers,
  getVirtualNumberEntitlement,
  VirtualNumberError
} from '@/lib/services/virtual-number'
import type { VirtualNumberErrorCode } from '@/lib/services/virtual-number'

const CODE_TO_STATUS: Record<VirtualNumberErrorCode, number> = {
  E164_INVALID: 400,
  NUMBER_NOT_FOUND: 404,
  NUMBER_TAKEN: 409,
  LIMIT_REACHED: 409,
  TELNYX_UNAVAILABLE: 500
}

function errorResponse(error: VirtualNumberError) {
  const status = CODE_TO_STATUS[error.code]
  if (status === 500) {
    console.error('Virtual number error:', error)
  }
  return NextResponse.json({ error: error.message }, { status })
}

export async function GET() {
  try {
    const authResult = await getAuthenticatedUser()
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }
    const user = authResult.user!

    const [assignments, entitlement] = await Promise.all([
      getVirtualNumbers(user.id),
      getVirtualNumberEntitlement(user.clerkUserId)
    ])
    return NextResponse.json({ assignments, quota: entitlement.quota })
  } catch (error) {
    console.error('Error getting virtual numbers:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await getAuthenticatedUser()
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }
    const user = authResult.user!

    const entitlement = await getVirtualNumberEntitlement(user.clerkUserId)
    if (!entitlement.entitled) {
      return NextResponse.json({ error: 'Not entitled to virtual numbers' }, { status: 403 })
    }

    let body: { phoneNumber?: unknown }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    if (body.phoneNumber !== null && typeof body.phoneNumber !== 'string') {
      return NextResponse.json({ error: 'phoneNumber must be a string or null' }, { status: 400 })
    }

    await assignNumber(user.id, body.phoneNumber, { quota: entitlement.quota })
    const assignments = await getVirtualNumbers(user.id)
    return NextResponse.json({ assignments })
  } catch (error) {
    if (error instanceof VirtualNumberError) {
      return errorResponse(error)
    }
    console.error('Error assigning virtual number:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const authResult = await getAuthenticatedUser()
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }
    const user = authResult.user!

    const entitlement = await getVirtualNumberEntitlement(user.clerkUserId)
    if (!entitlement.entitled) {
      return NextResponse.json({ error: 'Not entitled to virtual numbers' }, { status: 403 })
    }

    const phoneNumber = request.nextUrl.searchParams.get('phoneNumber')
    if (!phoneNumber) {
      return NextResponse.json({ error: 'phoneNumber query parameter is required' }, { status: 400 })
    }

    await disableNumber(user.id, phoneNumber)
    const assignments = await getVirtualNumbers(user.id)
    return NextResponse.json({ assignments })
  } catch (error) {
    if (error instanceof VirtualNumberError) {
      return errorResponse(error)
    }
    console.error('Error disabling virtual number:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
