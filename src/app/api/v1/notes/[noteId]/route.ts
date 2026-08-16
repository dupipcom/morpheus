import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'
import { WRITABLE_NOTE_VISIBILITIES } from '@/lib/constants/visibility'
import { sanitizeText } from '@/lib/utils/sanitize'
import type { Prisma } from '@/generated/prisma/client'

const OBJECT_ID_PATTERN = /^[a-f0-9]{24}$/i
const MAX_DOCUMENT_IDS = 10
const MAX_TAG_IDS = 20
const MAX_TASK_IDS = 10
const MAX_EVENT_IDS = 10

/** Parse an array of ObjectId strings, enforcing the cap; null when absent/invalid. */
function parseObjectIdArray(value: unknown, max: number): string[] | null {
  if (!Array.isArray(value)) return null
  if (value.length > max) return null
  if (!value.every((v) => typeof v === 'string' && OBJECT_ID_PATTERN.test(v))) return null
  return value as string[]
}

/** Parse the canonical location shape (same rules as POST /api/v1/notes). */
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

// PUT /api/v1/notes/[noteId] - Update a note
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ noteId: string }> }
) {
  try {
    const { userId } = await auth()
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { noteId } = await params
    const body = await request.json()
    const {
      content, visibility, date,
      documentIds, location, profileIds, listIds, taskIds, eventIds
    } = body

    if (!content || !content.trim()) {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 })
    }

    // Optional full-edit fields (attachments, location, entity tags), validated
    // with the same rules as POST /api/v1/notes.
    const parsedDocumentIds = documentIds !== undefined ? parseObjectIdArray(documentIds, MAX_DOCUMENT_IDS) : undefined
    if (documentIds !== undefined && !parsedDocumentIds) {
      return NextResponse.json({ error: 'documentIds must be an array of up to 10 document IDs' }, { status: 400 })
    }
    const parsedProfileIds = profileIds !== undefined ? parseObjectIdArray(profileIds, MAX_TAG_IDS) : undefined
    if (profileIds !== undefined && !parsedProfileIds) {
      return NextResponse.json({ error: 'profileIds must be an array of up to 20 profile IDs' }, { status: 400 })
    }
    const parsedListIds = listIds !== undefined ? parseObjectIdArray(listIds, MAX_TAG_IDS) : undefined
    if (listIds !== undefined && !parsedListIds) {
      return NextResponse.json({ error: 'listIds must be an array of up to 20 list IDs' }, { status: 400 })
    }
    const parsedTaskIds = taskIds !== undefined ? parseObjectIdArray(taskIds, MAX_TASK_IDS) : undefined
    if (taskIds !== undefined && !parsedTaskIds) {
      return NextResponse.json({ error: 'taskIds must be an array of up to 10 task IDs' }, { status: 400 })
    }
    const parsedEventIds = eventIds !== undefined ? parseObjectIdArray(eventIds, MAX_EVENT_IDS) : undefined
    if (eventIds !== undefined && !parsedEventIds) {
      return NextResponse.json({ error: 'eventIds must be an array of up to 10 event IDs' }, { status: 400 })
    }
    const parsedLocation = location !== undefined ? (location === null ? null : parseLocation(location)) : undefined
    if (location !== undefined && location !== null && !parsedLocation) {
      return NextResponse.json({ error: 'Invalid location' }, { status: 400 })
    }

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { userId }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Verify note exists and user owns it
    const note = await prisma.note.findUnique({
      where: { id: noteId }
    })

    if (!note) {
      return NextResponse.json({ error: 'Note not found' }, { status: 404 })
    }

    if (note.userId !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Attached documents must exist and belong to the caller
    if (parsedDocumentIds) {
      const owned = await prisma.document.count({
        where: { id: { in: parsedDocumentIds }, userId: user.id }
      })
      if (owned !== parsedDocumentIds.length) {
        return NextResponse.json({ error: 'You can only attach your own documents' }, { status: 403 })
      }
    }

    // Update note
    const updatedNote = await prisma.note.update({
      where: { id: noteId },
      data: {
        content: content.trim(),
        visibility: visibility !== undefined ? visibility : note.visibility,
        date: date !== undefined ? date : note.date,
        // Arrays are always truthy ([] clears the tags); null/undefined skips the field.
        ...(parsedDocumentIds ? { documentIds: parsedDocumentIds } : {}),
        ...(parsedLocation !== undefined ? { location: parsedLocation as Prisma.InputJsonValue | null } : {}),
        ...(parsedProfileIds ? { profileIds: parsedProfileIds } : {}),
        ...(parsedListIds ? { listIds: parsedListIds } : {}),
        ...(parsedTaskIds ? { taskIds: parsedTaskIds } : {}),
        ...(parsedEventIds ? { eventIds: parsedEventIds } : {})
      }
    })

    return NextResponse.json({ note: updatedNote })
  } catch (error) {
    console.error('Error updating note:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH /api/v1/notes/[noteId] - Update only visibility of a note
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ noteId: string }> }
) {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { noteId } = await params
    const body = await request.json()
    const { visibility } = body

    if (!visibility) {
      return NextResponse.json({ error: 'Visibility is required' }, { status: 400 })
    }

    if (!(WRITABLE_NOTE_VISIBILITIES as readonly string[]).includes(visibility)) {
      return NextResponse.json({ error: 'Invalid visibility value' }, { status: 400 })
    }

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { userId }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Verify note exists and user owns it
    const note = await prisma.note.findUnique({
      where: { id: noteId }
    })

    if (!note) {
      return NextResponse.json({ error: 'Note not found' }, { status: 404 })
    }

    if (note.userId !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Update visibility only
    const updatedNote = await prisma.note.update({
      where: { id: noteId },
      data: { visibility }
    })

    return NextResponse.json({ note: updatedNote })
  } catch (error) {
    console.error('Error updating note visibility:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/v1/notes/[noteId] - Delete a note
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ noteId: string }> }
) {
  try {
    const { userId } = await auth()
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { noteId } = await params

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { userId }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Verify note exists and user owns it
    const note = await prisma.note.findUnique({
      where: { id: noteId }
    })

    if (!note) {
      return NextResponse.json({ error: 'Note not found' }, { status: 404 })
    }

    if (note.userId !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Delete note
    await prisma.note.delete({
      where: { id: noteId }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting note:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

