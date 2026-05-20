'use client'

import { useState } from 'react'
import { SendHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

interface ChatComposerProps {
  placeholder: string
  onSubmit: (content: string) => Promise<void>
  disabled?: boolean
}

export function ChatComposer({ placeholder, onSubmit, disabled = false }: ChatComposerProps) {
  const [content, setContent] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

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

  return (
    <div className="space-y-3 border-t border-border bg-background/95 p-4">
      <Textarea
        value={content}
        onChange={(event) => setContent(event.target.value)}
        placeholder={placeholder}
        className="min-h-24 resize-none"
        disabled={disabled || isSubmitting}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            void submit()
          }
        }}
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
