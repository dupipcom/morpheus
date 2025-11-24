'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { NotesList, Note } from "@/components/notesList"
import { useI18n } from '@/lib/contexts/i18n'
import { useProfileNotes } from '@/lib/hooks/useProfile'
import { useUserData } from '@/lib/userUtils'

interface PublicNotesViewerProps {
  userName: string
  showCard?: boolean
  gridLayout?: boolean
}

export function PublicNotesViewer({ userName, showCard = true, gridLayout = false }: PublicNotesViewerProps) {
  const { t } = useI18n()
  const { notes, isLoading: loading, error: notesError, refreshNotes } = useProfileNotes(userName, true)
  const { data: userData } = useUserData(true)
  const currentUserId = userData?.id || null
  const isLoggedIn = !!userData

  // Refresh notes when the component becomes visible (e.g., after friend status changes)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        refreshNotes()
      }
    }

    const handleFocus = () => {
      refreshNotes()
    }

    // Listen for custom friend status change events
    const handleFriendStatusChange = () => {
      refreshNotes()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleFocus)
    window.addEventListener('friendStatusChanged', handleFriendStatusChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('friendStatusChanged', handleFriendStatusChange)
    }
  }, [userName, refreshNotes])

  const error = notesError ? t('errors.failedToLoadNotes') : null

  if (error) {
    const content = (
      <div className="text-center text-muted-foreground py-8">
        {error}
      </div>
    )
    
    if (!showCard) return content
    
    return (
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>{t('publicProfile.notes')}</CardTitle>
        </CardHeader>
        <CardContent>
          {content}
        </CardContent>
      </Card>
    )
  }

  const content = (
    <NotesList
      notes={notes}
      loading={loading}
      onRefresh={refreshNotes}
      showHeader={!showCard}
      emptyMessage={t('publicProfile.noPublicNotes')}
      gridLayout={gridLayout}
      isLoggedIn={isLoggedIn}
      currentUserId={currentUserId}
      onNoteUpdated={refreshNotes}
    />
  )

  if (!showCard) return content

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>{t('publicProfile.notes')}</CardTitle>
      </CardHeader>
      <CardContent>
        {content}
      </CardContent>
    </Card>
  )
}
