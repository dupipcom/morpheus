import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'

export async function GET() {
  try {
    const { userId } = await auth()
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { userId },
      include: { 
        notes: {
          include: {
            _count: {
              select: {
                comments: true,
                likes: true
              }
            },
            comments: {
              include: {
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
                },
                _count: {
                  select: {
                    likes: true
                  }
                }
              },
              orderBy: {
                createdAt: 'desc'
              }
            }
          }
        }
      }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Sort comments by likes, then by date
    const notesWithSortedComments = user.notes.map(note => {
      if (note.comments && Array.isArray(note.comments) && note.comments.length > 0) {
        const sortedComments = [...note.comments].sort((a: any, b: any) => {
          const likeDiff = (b._count?.likes || 0) - (a._count?.likes || 0)
          if (likeDiff !== 0) return likeDiff
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        })
        return { ...note, comments: sortedComments }
      }
      return note
    })

    return NextResponse.json({ notes: notesWithSortedComments })
  } catch (error) {
    console.error('Error fetching notes:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth()
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { content, visibility, date } = body

    if (!content) {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 })
    }

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { userId }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Create note
    const note = await prisma.note.create({
      data: {
        content,
        visibility: visibility || 'PRIVATE',
        date: date || null,
        userId: user.id
      }
    })

    return NextResponse.json({ note })
  } catch (error) {
    console.error('Error creating note:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
