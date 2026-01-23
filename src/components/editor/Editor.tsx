'use client'

import { useEffect, useState } from 'react'
import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin'
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin'
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary'
import { ListPlugin } from '@lexical/react/LexicalListPlugin'
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin'
import { MarkdownShortcutPlugin } from '@lexical/react/LexicalMarkdownShortcutPlugin'
import { TRANSFORMERS } from '@lexical/markdown'
import { HeadingNode, QuoteNode } from '@lexical/rich-text'
import { ListNode, ListItemNode } from '@lexical/list'
import { LinkNode, AutoLinkNode } from '@lexical/link'
import { CodeNode, CodeHighlightNode } from '@lexical/code'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import type { EditorState, SerializedEditorState } from 'lexical'
import { cn } from '@/lib/utils/utils'
import { EditorToolbar } from './EditorToolbar'

const theme = {
  ltr: 'ltr',
  rtl: 'rtl',
  paragraph: 'editor-paragraph',
  quote: 'editor-quote',
  heading: {
    h1: 'editor-heading-h1',
    h2: 'editor-heading-h2',
    h3: 'editor-heading-h3',
  },
  list: {
    nested: {
      listitem: 'editor-nested-listitem',
    },
    ol: 'editor-list-ol',
    ul: 'editor-list-ul',
    listitem: 'editor-listitem',
  },
  link: 'editor-link',
  text: {
    bold: 'editor-text-bold',
    italic: 'editor-text-italic',
    underline: 'editor-text-underline',
    strikethrough: 'editor-text-strikethrough',
    code: 'editor-text-code',
  },
  code: 'editor-code',
}

const nodes = [
  HeadingNode,
  QuoteNode,
  ListNode,
  ListItemNode,
  LinkNode,
  AutoLinkNode,
  CodeNode,
  CodeHighlightNode,
]

function onError(error: Error): void {
  console.error('Lexical Editor Error:', error)
}

interface EditorStatePluginProps {
  onSerializedChange?: (state: SerializedEditorState) => void
  initialState?: SerializedEditorState | null
}

function EditorStatePlugin({ onSerializedChange, initialState }: EditorStatePluginProps) {
  const [editor] = useLexicalComposerContext()
  const [isFirstRender, setIsFirstRender] = useState(true)

  // Set initial state
  useEffect(() => {
    if (initialState && isFirstRender) {
      const editorState = editor.parseEditorState(initialState)
      editor.setEditorState(editorState)
      setIsFirstRender(false)
    }
  }, [editor, initialState, isFirstRender])

  const handleChange = (editorState: EditorState) => {
    if (onSerializedChange) {
      const serialized = editorState.toJSON()
      onSerializedChange(serialized)
    }
  }

  return <OnChangePlugin onChange={handleChange} />
}

export interface EditorProps {
  editorSerializedState?: SerializedEditorState | null
  onSerializedChange?: (state: SerializedEditorState) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  minHeight?: number
}

export function Editor({
  editorSerializedState,
  onSerializedChange,
  placeholder = 'Start typing...',
  disabled = false,
  className,
  minHeight = 200,
}: EditorProps) {
  const initialConfig = {
    namespace: 'RichTextEditor',
    theme,
    nodes,
    onError,
    editable: !disabled,
  }

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <div className={cn('border rounded-md overflow-hidden bg-background', className)}>
        <EditorToolbar disabled={disabled} />
        <div className="relative">
          <RichTextPlugin
            contentEditable={
              <ContentEditable
                className={cn(
                  'p-3 outline-none prose prose-sm dark:prose-invert max-w-none',
                  'focus:outline-none',
                  disabled && 'opacity-50 cursor-not-allowed'
                )}
                style={{ minHeight: `${minHeight}px` }}
              />
            }
            placeholder={
              <div
                className="absolute top-3 left-3 text-muted-foreground pointer-events-none"
              >
                {placeholder}
              </div>
            }
            ErrorBoundary={LexicalErrorBoundary}
          />
          <HistoryPlugin />
          <ListPlugin />
          <LinkPlugin />
          <MarkdownShortcutPlugin transformers={TRANSFORMERS} />
          <EditorStatePlugin
            onSerializedChange={onSerializedChange}
            initialState={editorSerializedState}
          />
        </div>
      </div>
    </LexicalComposer>
  )
}
