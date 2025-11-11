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
                    profiles: {
                      select: {
                        data: true
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

    // Sort comments by likes, then by date, and transform profiles[0] to profile
    const notesWithSortedComments = user.notes.map(note => {
      if (note.comments && Array.isArray(note.comments) && note.comments.length > 0) {
        const sortedComments = [...note.comments].sort((a: any, b: any) => {
          const likeDiff = (b._count?.likes || 0) - (a._count?.likes || 0)
          if (likeDiff !== 0) return likeDiff
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        })
        // Transform profiles[0] to profile for comments and extract data values
        const commentsWithProfile = sortedComments.map((comment: any) => {
          const profileData = comment.user.profiles?.[0]?.data
          const profile = profileData ? {
            userName: profileData.username?.value || null,
            profilePicture: profileData.profilePicture?.value || null,
            firstName: profileData.firstName?.value || null,
            lastName: profileData.lastName?.value || null
          } : null
          
          return {
            ...comment,
            user: {
              ...comment.user,
              profile
            }
          }
        })
        return { ...note, comments: commentsWithProfile }
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
