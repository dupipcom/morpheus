import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'
import { sanitizeText } from '@/lib/utils/sanitize'
import { NOTE_VISIBILITIES, WRITABLE_NOTE_VISIBILITIES } from '@/lib/constants/visibility'
import { getDelegationScopes } from '@/lib/utils/delegation'
import { resolveNoteVisibilityFilter } from '@/lib/services/visibility/noteAccess'
import { resolveNoteTags, getCurrentUser, batchEnrichUserProfiles } from '@/lib/services/visibility'

const OBJECT_ID_PATTERN = /^[a-f0-9]{24}$/i

const MAX_DOCUMENT_IDS = 10
const MAX_TAG_IDS = 20
const MAX_TASK_IDS = 10
const MAX_EVENT_IDS = 10

/**
 * Parse an array of ObjectId strings, enforcing the given cap.
 * Returns null when the value is absent/invalid (caller decides 400 vs skip).
 */
function parseObjectIdArray(value: unknown, max: number): string[] | null {
  if (!Array.isArray(value)) return null
  if (value.length > max) return null
  if (!value.every((v) => typeof v === 'string' && OBJECT_ID_PATTERN.test(v))) return null
  return value as string[]
}

/**
 * Parse the canonical location JSON shape ({ lat, lng, placeId?, name?, address? }).
 * lat/lng must be finite numbers within valid ranges; strings are sanitized.
 * Returns null when invalid.
 */
function parseLocation(value: unknown): { lat: number; lng: number; placeId?: string; name?: string; address?: string } | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>

  const lat = typeof raw.lat === 'number' ? raw.lat : parseFloat(String(raw.lat))
  const lng = typeof raw.lng === 'number' ? raw.lng : parseFloat(String(raw.lng))
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null

  const location: { lat: number; lng: number; placeId?: string; name?: string; address?: string } = { lat, lng }
  if (typeof raw.placeId === 'string' && raw.placeId.trim()) location.placeId = sanitizeText(raw.placeId)
  if (typeof raw.name === 'string' && raw.name.trim()) location.name = sanitizeText(raw.name)
  if (typeof raw.address === 'string' && raw.address.trim()) location.address = sanitizeText(raw.address)
  return location
}

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
    const requestedUserId = searchParams.get('userId')
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

    // Own notes (owner + received) by default; a delegated target requires a
    // delegation record and is filtered to the visibilities it unlocks.
    let where: Record<string, unknown>
    if (requestedUserId && requestedUserId !== user.id) {
      const delegation = await prisma.delegation.findUnique({
        where: {
          delegatorId_delegatedId: {
            delegatorId: requestedUserId,
            delegatedId: user.id
          }
        }
      })

      if (!delegation) {
        return NextResponse.json({ error: 'Not authorized for selected user data' }, { status: 403 })
      }

      const noteVisibilityFilter = resolveNoteVisibilityFilter(delegation.scopes, delegation.scope)
      where = {
        userId: requestedUserId,
        ...(noteVisibilityFilter ? { visibility: { in: noteVisibilityFilter } } : {})
      }
    } else {
      where = {
        OR: [
          { userId: user.id },
          { recipientId: user.id }
        ]
      }
    }

    let sortedNotes = await prisma.note.findMany({
      where,
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

    // Attach document metadata (id/fileName/mimeType/kind) so clients can render
    // attachments inline (images/videos/audio/links through the authenticated
    // media pipe). Note has no `documents` relation, so this is one batched
    // query over every note's documentIds.
    const allDocumentIds = Array.from(
      new Set(sortedNotes.flatMap((note) => note.documentIds || []))
    )
    if (allDocumentIds.length > 0) {
      const documents = await prisma.document.findMany({
        where: { id: { in: allDocumentIds } },
        select: { id: true, fileName: true, mimeType: true, kind: true, posterUrl: true, location: true }
      })
      const docsById = new Map(documents.map((doc) => [doc.id, doc]))
      for (const note of sortedNotes) {
        if (note.documentIds.length > 0) {
          ;(note as { documents?: unknown[] }).documents = note.documentIds
            .map((id) => docsById.get(id))
            .filter(Boolean)
        }
      }
    }

    // Attach the author's profile in the same shape the Be feed uses
    // ({ id, profile: { userName, profilePicture, firstName, lastName } }), so
    // every note renderer shares one card contract (avatar + username header).
    const authorIds = Array.from(
      new Set(sortedNotes.map((note) => note.userId).filter((id): id is string => Boolean(id)))
    )
    if (authorIds.length > 0) {
      const viewer = await getCurrentUser(userId)
      const profilesMap = await batchEnrichUserProfiles(authorIds, viewer)
      for (const note of sortedNotes) {
        ;(note as { user?: unknown }).user =
          profilesMap.get(note.userId) || { id: note.userId, profile: { userName: null } }
      }
    }

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

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const {
      content,
      visibility,
      date,
      recipientId,
      aiEnabled,
      documentIds,
      location,
      profileIds,
      listIds,
      taskIds,
      eventIds,
      repostedListId
    } = body as Record<string, unknown>

    // Reposts: content may be empty when the note carries references
    // (eventIds/listIds/taskIds/profileIds) — a pure reference share.
    const hasReferences =
      (Array.isArray(profileIds) && profileIds.length > 0) ||
      (Array.isArray(listIds) && listIds.length > 0) ||
      (Array.isArray(taskIds) && taskIds.length > 0) ||
      (Array.isArray(eventIds) && eventIds.length > 0)

    if ((typeof content !== 'string' || !content.trim()) && !hasReferences) {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 })
    }

    const sanitizedContent = typeof content === 'string' ? sanitizeText(content) : ''

    const user = await prisma.user.findUnique({
      where: { userId }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (visibility && !(WRITABLE_NOTE_VISIBILITIES as readonly string[]).includes(visibility as string)) {
      return NextResponse.json({ error: 'Invalid visibility value' }, { status: 400 })
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
        select: {
          id: true,
          scope: true,
          scopes: true
        }
      })

      if (!delegation) {
        return NextResponse.json({ error: 'Not authorized to send note to this recipient' }, { status: 403 })
      }
      // All configured delegation scopes allow analyst-to-user note sharing; validate explicit scope value.
      if (getDelegationScopes(delegation.scopes, delegation.scope).length === 0) {
        return NextResponse.json({ error: 'Delegation scope is invalid for note sharing' }, { status: 403 })
      }

      validRecipientId = recipientUser.id
    }

    // Optional reference arrays and geo fields (all new fields are optional;
    // this must not break the existing POST shape).

    let validatedDocumentIds: string[] | undefined
    if (documentIds !== undefined) {
      const parsed = parseObjectIdArray(documentIds, MAX_DOCUMENT_IDS)
      if (!parsed) {
        return NextResponse.json({ error: 'documentIds must be an array of at most 10 ObjectIds' }, { status: 400 })
      }
      if (parsed.length > 0) {
        const owned = await prisma.document.findMany({
          where: { id: { in: parsed }, userId: user.id },
          select: { id: true }
        })
        if (owned.length !== parsed.length) {
          return NextResponse.json({ error: 'One or more documents are not yours' }, { status: 403 })
        }
      }
      validatedDocumentIds = parsed
    }

    let parsedLocation: { lat: number; lng: number; placeId?: string; name?: string; address?: string } | null = null
    if (location !== undefined) {
      parsedLocation = parseLocation(location)
      if (!parsedLocation) {
        return NextResponse.json({ error: 'Invalid location: lat/lng must be numbers in range, name/address plain text' }, { status: 400 })
      }
    }

    let validatedProfileIds: string[] | undefined
    if (profileIds !== undefined) {
      const parsed = parseObjectIdArray(profileIds, MAX_TAG_IDS)
      if (!parsed) {
        return NextResponse.json({ error: 'profileIds must be an array of at most 20 ObjectIds' }, { status: 400 })
      }
      validatedProfileIds = parsed
    }

    let validatedListIds: string[] | undefined
    if (listIds !== undefined) {
      const parsed = parseObjectIdArray(listIds, MAX_TAG_IDS)
      if (!parsed) {
        return NextResponse.json({ error: 'listIds must be an array of at most 20 ObjectIds' }, { status: 400 })
      }
      validatedListIds = parsed
    }

    let validatedTaskIds: string[] | undefined
    if (taskIds !== undefined) {
      const parsed = parseObjectIdArray(taskIds, MAX_TASK_IDS)
      if (!parsed) {
        return NextResponse.json({ error: 'taskIds must be an array of at most 10 ObjectIds' }, { status: 400 })
      }
      if (parsed.length > 0) {
        // Only tasks the caller can see may be tagged: public tasks or tasks in
        // lists the caller is a member of (mirrors resolveNoteTags semantics).
        const visibleTaskIds = await resolveNoteTags({ taskIds: parsed }, user.id)
        if (visibleTaskIds.length !== parsed.length) {
          return NextResponse.json({ error: 'One or more tasks are not visible to you' }, { status: 403 })
        }
      }
      validatedTaskIds = parsed
    }

    let validatedEventIds: string[] | undefined
    if (eventIds !== undefined) {
      const parsed = parseObjectIdArray(eventIds, MAX_EVENT_IDS)
      if (!parsed) {
        return NextResponse.json({ error: 'eventIds must be an array of at most 10 ObjectIds' }, { status: 400 })
      }
      if (parsed.length > 0) {
        const events = await prisma.event.findMany({
          where: { id: { in: parsed } },
          select: { id: true, userId: true, visibility: true }
        })
        const visibleEvents = events.filter(
          (event) => event.visibility === 'PUBLIC' || event.userId === user.id
        )
        if (visibleEvents.length !== parsed.length) {
          return NextResponse.json({ error: 'One or more events are not visible to you' }, { status: 403 })
        }
      }
      validatedEventIds = parsed
    }

    let validatedRepostedListId: string | undefined
    if (repostedListId !== undefined) {
      if (typeof repostedListId !== 'string' || !OBJECT_ID_PATTERN.test(repostedListId)) {
        return NextResponse.json({ error: 'Invalid repostedListId' }, { status: 400 })
      }
      const repostedList = await prisma.list.findUnique({
        where: { id: repostedListId },
        select: { visibility: true }
      })
      if (!repostedList || repostedList.visibility !== 'PUBLIC') {
        return NextResponse.json({ error: 'Only public lists can be reposted' }, { status: 403 })
      }
      validatedRepostedListId = repostedListId
    }

    const note = await prisma.note.create({
      data: {
        content: sanitizedContent,
        // New notes default PRIVATE unless the user set a preferred default
        visibility: ((typeof visibility === 'string' && visibility) as (typeof WRITABLE_NOTE_VISIBILITIES)[number] | undefined) || user.defaultNoteVisibility || 'PRIVATE',
        aiEnabled: aiEnabled === true,
        date: typeof date === 'string' ? date : null,
        userId: user.id,
        senderId: user.id,
        recipientId: validRecipientId,
        ...(validatedDocumentIds ? { documentIds: validatedDocumentIds } : {}),
        ...(parsedLocation ? { location: parsedLocation } : {}),
        ...(validatedProfileIds ? { profileIds: validatedProfileIds } : {}),
        ...(validatedListIds ? { listIds: validatedListIds } : {}),
        ...(validatedTaskIds ? { taskIds: validatedTaskIds } : {}),
        ...(validatedEventIds ? { eventIds: validatedEventIds } : {}),
        ...(validatedRepostedListId ? { repostedListId: validatedRepostedListId } : {})
      }
    })

    return NextResponse.json({ note })
  } catch (error) {
    console.error('Error creating note:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
