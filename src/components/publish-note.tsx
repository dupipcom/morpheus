'use client'

import { useState } from 'react'
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { useI18n } from "@/lib/contexts/i18n"
import { useNotesRefresh } from "@/lib/contexts/notesRefresh"
import { Send, Loader2 } from "lucide-react"
import { VisibilitySelect } from "@/components/VisibilitySelect"

interface PublishNoteProps {
  onNotePublished?: () => void
  date?: string
  defaultVisibility?: string
}

export const PublishNote = ({ onNotePublished, date, defaultVisibility = 'AI_ENABLED' }: PublishNoteProps) => {
  const { t } = useI18n()
  const { refreshAll } = useNotesRefresh()
  const [noteContent, setNoteContent] = useState('')
  const [noteVisibility, setNoteVisibility] = useState(defaultVisibility)
  const [isPublishing, setIsPublishing] = useState(false)

  const handlePublishNote = async () => {
    if (!noteContent.trim() || isPublishing) return

    setIsPublishing(true)
    try {
      const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
      const today = new Date()
      const todayDate = today.toLocaleString('en-uk', { timeZone: userTimezone }).split(',')[0].split('/').reverse().join('-')
      const noteDate = date || todayDate

      const response = await fetch('/api/v1/notes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: noteContent.trim(),
          visibility: noteVisibility,
          date: noteDate
        }),
      })

      if (response.ok) {
        // Clear the note content after successful publish
        setNoteContent('')
        // Refresh all registered note lists
        refreshAll()
        if (onNotePublished) {
          onNotePublished()
        }
      }
    } catch (error) {
      console.error('Error publishing note:', error)
    } finally {
      setIsPublishing(false)
    }
  }

  const formContent = (
    <>
      {/* Mobile: 4-column grid (textarea 3/4, controls 1/4 stacked), Desktop: stacked */}
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-1 sm:gap-0 mb-0">
        <Textarea 
          className="col-span-3 sm:col-span-1 mb-0 sm:mb-3 sm:mb-4 w-full" 
          placeholder={t('mood.publish.placeholder') || 'Write your note here...'}
          value={noteContent} 
          onChange={(e) => {
            setNoteContent(e.target.value)
          }}
        />
        <div className="col-span-1 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4 min-w-0">
          <VisibilitySelect 
            value={noteVisibility} 
            onValueChange={setNoteVisibility}
          />
          <Button 
            onClick={handlePublishNote}
            disabled={!noteContent.trim() || isPublishing}
            className="bg-primary text-primary-foreground hover:bg-primary/90 w-full min-h-[40px] sm:w-auto sm:min-h-0 justify-center items-center md:justify-start"
          >
            <span className="md:hidden flex items-center justify-center">
              {isPublishing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </span>
            <span className="hidden md:inline">
              {isPublishing ? t('mood.publish.publishing') : t('mood.publish.action')}
            </span>
          </Button>
        </div>
      </div>
    </>
  )

  return (
    <div className="p-3 sm:p-4 border rounded-lg bg-transparent border-body w-full max-w-full">
      {/* Mobile: Accordion, Desktop: Always visible */}
      <div className="md:hidden">
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="publish-note" className="border-none">
            <AccordionTrigger className="py-0 px-0 hover:no-underline">
              <h3 className="text-base font-semibold text-body">{t('mood.publish.title') || 'Publish a Note'}</h3>
            </AccordionTrigger>
            <AccordionContent className="pt-3 pb-0">
              {formContent}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
      
      {/* Desktop: Always visible */}
      <div className="hidden md:block">
        <h3 className="text-lg font-semibold mb-4 text-body">{t('mood.publish.title') || 'Publish a Note'}</h3>
        {formContent}
      </div>
    </div>
  )
}

