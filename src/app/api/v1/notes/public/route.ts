import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '100')
    const skip = (page - 1) * limit

    // Fetch public notes with user profile info
    const notes = await prisma.note.findMany({
      where: {
        visibility: 'PUBLIC'
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: limit,
      skip: skip,
      select: {
        id: true,
        content: true,
        visibility: true,
        createdAt: true,
        date: true,
        user: {
          select: {
            id: true,
            profile: {
              select: {
                userName: true,
                profilePicture: true,
                firstName: true,
                lastName: true
              }
            }
          }
        }
      }
    })

    // Get total count for pagination
    const totalCount = await prisma.note.count({
      where: {
        visibility: 'PUBLIC'
      }
    })

    const hasMore = skip + notes.length < totalCount

    return NextResponse.json({ 
      notes, 
      hasMore,
      totalCount,
      currentPage: page,
      totalPages: Math.ceil(totalCount / limit)
    })
  } catch (error) {
    console.error('Error fetching public notes:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

