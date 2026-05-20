import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'
import { sanitizeText } from '@/lib/utils/sanitize'
import { NOTE_VISIBILITIES } from '@/lib/constants/visibility'

function toUserSummary(user: {
  id: string
  profiles?: Array<{ data?: Record<string, unknown> | null }>
} | null) {
  if (!user) return null

  const profileData = user.profiles?.[0]?.data as Record<string, { value?: string | null }> | undefined
  return {
    id: user.id,
    userName: profileData?.username?.value || null,
    firstName: profileData?.firstName?.value || null,
    lastName: profileData?.lastName?.value || null
  }
}

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const filterNoteId = searchParams.get('noteId')
    const requestedVisibility = searchParams.get('visibility')
    const selectedVisibility = requestedVisibility
      ? requestedVisibility.split(',').map(v => v.trim().toUpperCase()).filter(v => NOTE_VISIBILITIES.includes(v as typeof NOTE_VISIBILITIES[number]))
      : null

    const user = await prisma.user.findUnique({
      where: { userId }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    let sortedNotes = await prisma.note.findMany({
      where: {
        OR: [
          { userId: user.id },
          { recipientId: user.id }
        ]
      },
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
        },
        sender: {
          select: {
            id: true,
            profiles: {
              select: {
                data: true
              }
            }
          }
        },
        recipient: {
          select: {
            id: true,
            profiles: {
              select: {
                data: true
              }
            }
          }
        }
      }
    })

    if (selectedVisibility && selectedVisibility.length > 0) {
      sortedNotes = sortedNotes.filter(note => selectedVisibility.includes(note.visibility))
    }

    if (filterNoteId) {
      sortedNotes.sort((a, b) => {
        const aMatches = a.id.toString() === filterNoteId
        const bMatches = b.id.toString() === filterNoteId
        if (aMatches && !bMatches) return -1
        if (!aMatches && bMatches) return 1
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      })
    } else {
      sortedNotes.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    }

    const notesWithSortedComments = sortedNotes.map(note => {
      type NoteComment = {
        _count?: { likes?: number }
        createdAt: Date
        user: { id: string; profiles?: Array<{ data?: Record<string, { value?: string | null }> | null }> }
      }

      const sortedComments = (note.comments || []).sort((a: NoteComment, b: NoteComment) => {
        const likeDiff = (b._count?.likes || 0) - (a._count?.likes || 0)
        if (likeDiff !== 0) return likeDiff
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      })

      const commentsWithProfile = sortedComments.map((comment: NoteComment) => {
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

      return {
        ...note,
        sender: toUserSummary(note.sender),
        recipient: toUserSummary(note.recipient),
        comments: commentsWithProfile
      }
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
    const { content, visibility, date, recipientId } = body

    if (!content) {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 })
    }

    const sanitizedContent = sanitizeText(content)

    const user = await prisma.user.findUnique({
      where: { userId }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    let validRecipientId: string | null = null

    if (recipientId) {
      const recipientUser = await prisma.user.findUnique({
        where: { id: String(recipientId) },
        select: { id: true }
      })

      if (!recipientUser) {
        return NextResponse.json({ error: 'Recipient not found' }, { status: 404 })
      }

      const delegation = await prisma.delegation.findUnique({
        where: {
          delegatorId_delegatedId: {
            delegatorId: recipientUser.id,
            delegatedId: user.id
          }
        },
        select: { id: true }
      })

      if (!delegation) {
        return NextResponse.json({ error: 'Not authorized to send note to this recipient' }, { status: 403 })
      }

      validRecipientId = recipientUser.id
    }

    const note = await prisma.note.create({
      data: {
        content: sanitizedContent,
        visibility: visibility || 'PRIVATE',
        date: date || null,
        userId: user.id,
        senderId: user.id,
        recipientId: validRecipientId
      }
    })

    return NextResponse.json({ note })
  } catch (error) {
    console.error('Error creating note:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
