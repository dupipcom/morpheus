import prisma from '@/lib/prisma'
import { sanitizeHTML } from '@/lib/utils/sanitize'

export interface CreateJobNoteParams {
  content: string
  userId: string
  jobId: string
  taskId: string
  listId: string
  type: 'job_submission' | 'job_review'
}

export async function createJobNote(
  params: CreateJobNoteParams
): Promise<{ success: boolean; noteId?: string; error?: string }> {
  const { content, userId, jobId, taskId, listId, type } = params

  if (!content.trim()) {
    return { success: false, error: 'Note content is required' }
  }

  // Sanitize content to prevent XSS attacks
  // Server-side sanitization provides defense-in-depth
  const sanitizedContent = sanitizeHTML(content)

  try {
    const note = await prisma.note.create({
      data: {
        content: sanitizedContent,
        userId,
        visibility: 'PRIVATE',
      }
    })

    return { success: true, noteId: note.id }
  } catch (error) {
    console.error('Error creating job note:', error)
    return { success: false, error: 'Failed to create note' }
  }
}
