'use client'

import type { NoteDocumentRef } from '@/components/noteAttachments'

/** A note handed to the Write composer for full editing. */
export interface EditingNote {
  id: string
  content: string
  visibility?: string
  date?: string
  aiEnabled?: boolean
  documents?: NoteDocumentRef[] | null
  taskIds?: string[] | null
  profileIds?: string[] | null
  listIds?: string[] | null
  eventIds?: string[] | null
  location?: { lat: number; lng: number; name?: string; address?: string } | null
}

/**
 * Module-level pub/sub for "edit this note in the Write composer" requests.
 * The note cards and the composer live in different parts of the tree (e.g.
 * ActivityCard in the feed vs PublishNote at the page top), so a plain store
 * avoids threading props through every layer. Consumers subscribe with
 * useSyncExternalStore.
 */
let current: EditingNote | null = null
const listeners = new Set<() => void>()

export function requestEditNote(note: EditingNote): void {
  current = note
  listeners.forEach((listener) => listener())
}

export function clearEditNote(): void {
  current = null
  listeners.forEach((listener) => listener())
}

export function getEditingNote(): EditingNote | null {
  return current
}

export function subscribeEditingNote(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
