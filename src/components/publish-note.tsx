'use client'

import { useState } from 'react'
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useI18n } from "@/lib/contexts/i18n"
import { Lock, Users, UserCheck, Globe, Sparkles, Send, Loader2 } from "lucide-react"

interface PublishNoteProps {
  onNotePublished?: () => void
  date?: string
  defaultVisibility?: string
}

const getVisibilityIcon = (visibility: string) => {
  switch (visibility) {
    case 'PRIVATE':
      return <Lock className="h-4 w-4" />
    case 'FRIENDS':
      return <Users className="h-4 w-4" />
    case 'CLOSE_FRIENDS':
      return <UserCheck className="h-4 w-4" />
    case 'PUBLIC':
      return <Globe className="h-4 w-4" />
    case 'AI_ENABLED':
      return <Sparkles className="h-4 w-4" />
    default:
      return <Lock className="h-4 w-4" />
  }
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
    <div className="p-3 sm:p-4 border rounded-lg bg-transparent border-body w-full max-w-full">
      <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4 text-body">{t('mood.publish.title') || 'Publish a Note'}</h3>
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
          <Select value={noteVisibility} onValueChange={setNoteVisibility}>
            <SelectTrigger className="w-full min-h-[40px] sm:w-48 sm:h-auto justify-center md:justify-between">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="PRIVATE">
                <div className="flex items-center gap-2">
                  <Lock className="h-4 w-4" />
                  <span>{t('mood.publish.visibility.PRIVATE') || 'Private'}</span>
                </div>
              </SelectItem>
              <SelectItem value="FRIENDS">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  <span>{t('mood.publish.visibility.FRIENDS') || 'Friends'}</span>
                </div>
              </SelectItem>
              <SelectItem value="CLOSE_FRIENDS">
                <div className="flex items-center gap-2">
                  <UserCheck className="h-4 w-4" />
                  <span>{t('mood.publish.visibility.CLOSE_FRIENDS') || 'Close Friends'}</span>
                </div>
              </SelectItem>
              <SelectItem value="PUBLIC">
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4" />
                  <span>{t('mood.publish.visibility.PUBLIC') || 'Public'}</span>
                </div>
              </SelectItem>
              <SelectItem value="AI_ENABLED">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  <span>{t('mood.publish.visibility.AI_ENABLED') || 'AI Enabled'}</span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
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
              {isPublishing ? t('common.loading') || 'Publishing...' : (t('mood.publish.action') || 'Publish Note')}
            </span>
          </Button>
        </div>
      </div>
    </div>
  )
}

