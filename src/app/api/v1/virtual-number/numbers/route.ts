import { NextResponse } from 'next/server'

import { getAuthenticatedUser } from '@/lib/services/auth'
import { getAvailableNumbers, hasVirtualNumberEntitlement } from '@/lib/services/virtual-number'

export async function GET() {
  try {
    const authResult = await getAuthenticatedUser()
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }
    const user = authResult.user!

    if (!(await hasVirtualNumberEntitlement(user.clerkUserId))) {
      return NextResponse.json({ error: 'Not entitled to virtual numbers' }, { status: 403 })
    }

    const numbers = await getAvailableNumbers()
    return NextResponse.json({ numbers })
  } catch (error) {
    console.error('Error listing available virtual numbers:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
