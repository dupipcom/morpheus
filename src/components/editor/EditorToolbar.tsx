'use client'

import { useCallback } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  $getSelection,
  $isRangeSelection,
  FORMAT_TEXT_COMMAND,
  UNDO_COMMAND,
  REDO_COMMAND,
} from 'lexical'
import {
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  REMOVE_LIST_COMMAND,
} from '@lexical/list'
import { $isLinkNode, TOGGLE_LINK_COMMAND } from '@lexical/link'
import { $getNearestNodeOfType } from '@lexical/utils'
import { ListNode } from '@lexical/list'
import { Button } from '@/components/ui/button'
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  List,
  ListOrdered,
  Link as LinkIcon,
  Undo,
  Redo,
  Code,
} from 'lucide-react'
import { cn } from '@/lib/utils/utils'

interface EditorToolbarProps {
  disabled?: boolean
}

export function EditorToolbar({ disabled = false }: EditorToolbarProps) {
  const [editor] = useLexicalComposerContext()

  const formatBold = useCallback(() => {
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold')
  }, [editor])

  const formatItalic = useCallback(() => {
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic')
  }, [editor])

  const formatUnderline = useCallback(() => {
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'underline')
  }, [editor])

  const formatStrikethrough = useCallback(() => {
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'strikethrough')
  }, [editor])

  const formatCode = useCallback(() => {
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'code')
  }, [editor])

  const formatBulletList = useCallback(() => {
    editor.update(() => {
      const selection = $getSelection()
      if ($isRangeSelection(selection)) {
        const anchorNode = selection.anchor.getNode()
        const element = anchorNode.getTopLevelElement()
        if (element) {
          const listNode = $getNearestNodeOfType(anchorNode, ListNode)
          if (listNode && listNode.getListType() === 'bullet') {
            editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined)
          } else {
            editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined)
          }
        }
      }
    })
  }, [editor])

  const formatNumberedList = useCallback(() => {
    editor.update(() => {
      const selection = $getSelection()
      if ($isRangeSelection(selection)) {
        const anchorNode = selection.anchor.getNode()
        const element = anchorNode.getTopLevelElement()
        if (element) {
          const listNode = $getNearestNodeOfType(anchorNode, ListNode)
          if (listNode && listNode.getListType() === 'number') {
            editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined)
          } else {
            editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined)
          }
        }
      }
    })
  }, [editor])

  const insertLink = useCallback(() => {
    editor.update(() => {
      const selection = $getSelection()
      if ($isRangeSelection(selection)) {
        const node = selection.anchor.getNode()
        const parent = node.getParent()
        if ($isLinkNode(parent)) {
          editor.dispatchCommand(TOGGLE_LINK_COMMAND, null)
        } else {
          const url = prompt('Enter URL:')
          if (url) {
            editor.dispatchCommand(TOGGLE_LINK_COMMAND, url)
          }
        }
      }
    })
  }, [editor])

  const undo = useCallback(() => {
    editor.dispatchCommand(UNDO_COMMAND, undefined)
  }, [editor])

  const redo = useCallback(() => {
    editor.dispatchCommand(REDO_COMMAND, undefined)
  }, [editor])

  return (
    <div className="flex items-center gap-0.5 p-1.5 border-b bg-muted/30 flex-wrap">
      <ToolbarButton
        onClick={undo}
        disabled={disabled}
        aria-label="Undo"
        title="Undo (Ctrl+Z)"
      >
        <Undo className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={redo}
        disabled={disabled}
        aria-label="Redo"
        title="Redo (Ctrl+Y)"
      >
        <Redo className="h-4 w-4" />
      </ToolbarButton>

      <Divider />

      <ToolbarButton
        onClick={formatBold}
        disabled={disabled}
        aria-label="Bold"
        title="Bold (Ctrl+B)"
      >
        <Bold className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={formatItalic}
        disabled={disabled}
        aria-label="Italic"
        title="Italic (Ctrl+I)"
      >
        <Italic className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={formatUnderline}
        disabled={disabled}
        aria-label="Underline"
        title="Underline (Ctrl+U)"
      >
        <Underline className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={formatStrikethrough}
        disabled={disabled}
        aria-label="Strikethrough"
        title="Strikethrough"
      >
        <Strikethrough className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={formatCode}
        disabled={disabled}
        aria-label="Code"
        title="Inline Code"
      >
        <Code className="h-4 w-4" />
      </ToolbarButton>

      <Divider />

      <ToolbarButton
        onClick={formatBulletList}
        disabled={disabled}
        aria-label="Bullet List"
        title="Bullet List"
      >
        <List className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={formatNumberedList}
        disabled={disabled}
        aria-label="Numbered List"
        title="Numbered List"
      >
        <ListOrdered className="h-4 w-4" />
      </ToolbarButton>

      <Divider />

      <ToolbarButton
        onClick={insertLink}
        disabled={disabled}
        aria-label="Insert Link"
        title="Insert Link"
      >
        <LinkIcon className="h-4 w-4" />
      </ToolbarButton>
    </div>
  )
}

function ToolbarButton({
  onClick,
  disabled,
  children,
  className,
  ...props
}: {
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
  className?: string
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onClick}
      disabled={disabled}
      className={cn('h-8 w-8 p-0', className)}
      {...props}
    >
      {children}
    </Button>
  )
}

function Divider() {
  return <div className="w-px h-6 bg-border mx-1" />
}
