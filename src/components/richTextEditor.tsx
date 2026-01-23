'use client'

import { useState, useMemo, useCallback } from 'react'
import type { SerializedEditorState } from 'lexical'
import { Editor } from '@/components/editor'
import { cn } from '@/lib/utils/utils'

interface RichTextEditorProps {
  id?: string
  /**
   * Editor state as Lexical JSON. For new editors, pass null or undefined.
   * For existing content, pass the SerializedEditorState.
   */
  value: SerializedEditorState | null
  /**
   * Called when editor content changes with the serialized Lexical state.
   */
  onChange: (value: SerializedEditorState) => void
  placeholder?: string
  minHeight?: number
  disabled?: boolean
  className?: string
}

/**
 * Creates an empty Lexical editor state
 */
export function createEmptyEditorState(): SerializedEditorState {
  return {
    root: {
      children: [
        {
          children: [],
          direction: null,
          format: '',
          indent: 0,
          type: 'paragraph',
          version: 1,
        },
      ],
      direction: null,
      format: '',
      indent: 0,
      type: 'root',
      version: 1,
    },
  }
}

/**
 * Creates a Lexical editor state with initial text content
 */
export function createEditorStateWithText(text: string): SerializedEditorState {
  return {
    root: {
      children: [
        {
          children: [
            {
              detail: 0,
              format: 0,
              mode: 'normal',
              style: '',
              text: text,
              type: 'text',
              version: 1,
            },
          ],
          direction: 'ltr',
          format: '',
          indent: 0,
          type: 'paragraph',
          version: 1,
        },
      ],
      direction: 'ltr',
      format: '',
      indent: 0,
      type: 'root',
      version: 1,
    },
  }
}

/**
 * Checks if an editor state is empty (no content)
 */
export function isEditorStateEmpty(state: SerializedEditorState | null): boolean {
  if (!state) return true

  const root = state.root
  if (!root || !root.children || root.children.length === 0) return true

  // Check if all paragraphs are empty
  for (const child of root.children) {
    if (child.type === 'paragraph') {
      const paragraph = child as { children?: Array<{ text?: string }> }
      if (paragraph.children && paragraph.children.length > 0) {
        for (const textNode of paragraph.children) {
          if (textNode.text && textNode.text.trim().length > 0) {
            return false
          }
        }
      }
    } else {
      // Non-paragraph node (list, quote, etc.) - not empty
      return false
    }
  }

  return true
}

/**
 * Extracts plain text from an editor state (useful for previews/summaries)
 */
export function extractTextFromEditorState(state: SerializedEditorState | null): string {
  if (!state || !state.root || !state.root.children) return ''

  const extractText = (node: Record<string, unknown>): string => {
    if (node.type === 'text') {
      return (node.text as string) || ''
    }

    if (Array.isArray(node.children)) {
      return node.children.map(child => extractText(child as Record<string, unknown>)).join('')
    }

    return ''
  }

  return state.root.children
    .map(child => extractText(child as Record<string, unknown>))
    .join('\n')
    .trim()
}

export function RichTextEditor({
  id,
  value,
  onChange,
  placeholder = 'Start typing...',
  minHeight = 200,
  disabled = false,
  className,
}: RichTextEditorProps) {
  // Memoize the initial state to prevent re-renders
  const initialState = useMemo(() => value, [])

  const handleChange = useCallback((state: SerializedEditorState) => {
    onChange(state)
  }, [onChange])

  return (
    <div className={cn('rich-text-editor', className)} id={id}>
      <Editor
        editorSerializedState={initialState}
        onSerializedChange={handleChange}
        placeholder={placeholder}
        disabled={disabled}
        minHeight={minHeight}
      />
    </div>
  )
}

// Export the Editor component directly for advanced use cases
export { Editor } from '@/components/editor'
export type { EditorProps } from '@/components/editor'
