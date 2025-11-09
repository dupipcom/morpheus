'use client'

import { useState } from 'react'
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useI18n } from "@/lib/contexts/i18n"

interface PublishNoteProps {
  onNotePublished?: () => void
  date?: string
  defaultVisibility?: string
}

export const PublishNote = ({ onNotePublished, date, defaultVisibility = 'AI_ENABLED' }: PublishNoteProps) => {
  const { t } = useI18n()
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

  return (
    <div className="p-3 sm:p-4 border rounded-lg bg-transparent border-body w-full">
      <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4 text-body">{t('mood.publish.title') || 'Publish a Note'}</h3>
      <Textarea 
        className="mb-3 sm:mb-4 w-full" 
        placeholder={t('mood.publish.placeholder') || 'Write your note here...'}
        value={noteContent} 
        onChange={(e) => {
          setNoteContent(e.target.value)
        }}
      />
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4 mb-0">
        <Select value={noteVisibility} onValueChange={setNoteVisibility}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder={t('mood.publish.selectVisibility') || 'Select visibility'} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="PRIVATE">{t('mood.publish.visibility.PRIVATE') || 'Private'}</SelectItem>
            <SelectItem value="FRIENDS">{t('mood.publish.visibility.FRIENDS') || 'Friends'}</SelectItem>
            <SelectItem value="CLOSE_FRIENDS">{t('mood.publish.visibility.CLOSE_FRIENDS') || 'Close Friends'}</SelectItem>
            <SelectItem value="PUBLIC">{t('mood.publish.visibility.PUBLIC') || 'Public'}</SelectItem>
            <SelectItem value="AI_ENABLED">{t('mood.publish.visibility.AI_ENABLED') || 'AI Enabled'}</SelectItem>
          </SelectContent>
        </Select>
        <Button 
          onClick={handlePublishNote}
          disabled={!noteContent.trim() || isPublishing}
          className="bg-primary text-primary-foreground hover:bg-primary/90 w-full sm:w-auto"
        >
          {isPublishing ? t('common.loading') || 'Publishing...' : (t('mood.publish.action') || 'Publish Note')}
        </Button>
      </div>
    </div>
  )
}

