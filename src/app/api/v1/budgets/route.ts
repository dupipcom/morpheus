/**
 * Budgets API Route Handler
 *
 * GET: List the authenticated user's budgets
 * POST: Create a simple budget (name, totalAmount)
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'
import { sanitizeText } from '@/lib/utils/sanitize'

export async function GET() {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { userId },
      select: { id: true }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const budgets = await prisma.budget.findMany({
      where: { ownerId: user.id },
      orderBy: { createdAt: 'desc' }
    })

    return NextResponse.json({ budgets })
  } catch (error) {
    console.error('Error in GET /api/v1/budgets:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { userId },
      select: { id: true }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const { name, totalAmount, description } = body as Record<string, unknown>

    if (typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Missing required field: name' }, { status: 400 })
    }

    const parsedAmount = typeof totalAmount === 'number' ? totalAmount : parseFloat(String(totalAmount || ''))
    if (isNaN(parsedAmount) || parsedAmount < 0) {
      return NextResponse.json({ error: 'totalAmount must be a positive number' }, { status: 400 })
    }

    const budget = await prisma.budget.create({
      data: {
        name: sanitizeText(name),
        description: typeof description === 'string' ? sanitizeText(description) : null,
        totalAmount: parsedAmount,
        remainingAmount: parsedAmount,
        ownerId: user.id
      }
    })

    return NextResponse.json({ budget })
  } catch (error) {
    console.error('Error in POST /api/v1/budgets:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
