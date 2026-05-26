'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, SendHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

interface ChatComposerProps {
  placeholder: string
  onSubmit: (content: string) => Promise<void>
  disabled?: boolean
  /** When true, renders a collapsible fixed-bottom overlay on mobile and the standard inline composer on md+. */
  collapsible?: boolean
}

export function ChatComposer({ placeholder, onSubmit, disabled = false, collapsible = false }: ChatComposerProps) {
  const [content, setContent] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isOpen, setIsOpen] = useState(true)

  const submit = async () => {
    const trimmed = content.trim()
    if (!trimmed || isSubmitting || disabled) return

    setIsSubmitting(true)
    try {
      await onSubmit(trimmed)
      setContent('')
    } finally {
      setIsSubmitting(false)
    }
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      void submit()
    }
  }

  if (collapsible) {
    return (
      <>
        {/* Mobile: fixed overlay at viewport bottom, collapsible */}
        <div className="fixed bottom-0 left-0 right-0 z-[1010] border-t border-border bg-background/95 backdrop-blur-sm md:hidden">
          <div className="flex items-center justify-between px-4 py-2">
            {isOpen ? (
              <span className="sr-only">{placeholder}</span>
            ) : (
              <button
                className="flex-1 text-left text-sm text-muted-foreground"
                onClick={() => setIsOpen(true)}
              >
                {placeholder}
              </button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto"
              onClick={() => setIsOpen((prev) => !prev)}
              aria-label={isOpen ? 'Collapse composer' : 'Open composer'}
            >
              {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </Button>
          </div>
          {isOpen && (
            <div className="space-y-3 px-4 pb-4">
              <Textarea
                value={content}
                onChange={(event) => setContent(event.target.value)}
                placeholder={placeholder}
                className="min-h-[80px] resize-none"
                disabled={disabled || isSubmitting}
                onKeyDown={onKeyDown}
                autoFocus
              />
              <div className="flex justify-end">
                <Button onClick={() => void submit()} disabled={disabled || isSubmitting || !content.trim()}>
                  <SendHorizontal className="h-4 w-4" />
                  Send
                </Button>
              </div>
            </div>
          )}
        </div>
        {/* Desktop (md+): standard inline composer */}
        <div className="hidden space-y-3 border-t border-border bg-background/95 p-4 md:block">
          <Textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder={placeholder}
            className="min-h-24 resize-none"
            disabled={disabled || isSubmitting}
            onKeyDown={onKeyDown}
          />
          <div className="flex justify-end">
            <Button onClick={() => void submit()} disabled={disabled || isSubmitting || !content.trim()}>
              <SendHorizontal className="h-4 w-4" />
              Send
            </Button>
          </div>
        </div>
      </>
    )
  }

  return (
    <div className="space-y-3 border-t border-border bg-background/95 p-4">
      <Textarea
        value={content}
        onChange={(event) => setContent(event.target.value)}
        placeholder={placeholder}
        className="min-h-24 resize-none"
        disabled={disabled || isSubmitting}
        onKeyDown={onKeyDown}
      />
      <div className="flex justify-end">
        <Button onClick={() => void submit()} disabled={disabled || isSubmitting || !content.trim()}>
          <SendHorizontal className="h-4 w-4" />
          Send
        </Button>
      </div>
    </div>
  )
}
