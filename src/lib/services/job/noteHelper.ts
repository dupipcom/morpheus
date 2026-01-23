import prisma from '@/lib/prisma'

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
  // Note: Frontend RichTextEditor should handle initial sanitization,
  // but server-side sanitization adds defense-in-depth
  // If needed, add DOMPurify: const sanitizedContent = DOMPurify.sanitize(content)

  try {
    const note = await prisma.note.create({
      data: {
        content,
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
