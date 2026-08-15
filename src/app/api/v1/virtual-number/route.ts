import { NextRequest, NextResponse } from 'next/server'

import { getAuthenticatedUser } from '@/lib/services/auth'
import {
  assignNumber,
  getAssignedNumber,
  hasVirtualNumberEntitlement,
  VirtualNumberError
} from '@/lib/services/virtual-number'
import type { VirtualNumberErrorCode } from '@/lib/services/virtual-number'

const CODE_TO_STATUS: Record<VirtualNumberErrorCode, number> = {
  E164_INVALID: 400,
  NUMBER_NOT_FOUND: 404,
  NUMBER_TAKEN: 409,
  TELNYX_UNAVAILABLE: 500
}

const CODE_TO_MESSAGE: Record<VirtualNumberErrorCode, string> = {
  E164_INVALID: 'phoneNumber must be a valid E.164 number',
  NUMBER_NOT_FOUND: 'Number not found in your Telnyx account',
  NUMBER_TAKEN: 'This number is already assigned to another user',
  TELNYX_UNAVAILABLE: 'Internal server error'
}

export async function GET() {
  try {
    const authResult = await getAuthenticatedUser()
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }

    const assignment = await getAssignedNumber(authResult.user!.id)
    return NextResponse.json({ assignment })
  } catch (error) {
    console.error('Error getting virtual number:', error)
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

    if (!(await hasVirtualNumberEntitlement(user.clerkUserId))) {
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

    const assignment = await assignNumber(user.id, body.phoneNumber)
    return NextResponse.json({ assignment })
  } catch (error) {
    if (error instanceof VirtualNumberError) {
      const status = CODE_TO_STATUS[error.code]
      if (status === 500) {
        console.error('Virtual number error:', error)
      }
      return NextResponse.json({ error: CODE_TO_MESSAGE[error.code] }, { status })
    }
    console.error('Error assigning virtual number:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
