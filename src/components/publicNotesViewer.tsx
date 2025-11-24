'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { NotesList, Note } from "@/components/notesList"
import { useI18n } from '@/lib/contexts/i18n'

interface PublicNotesViewerProps {
  userName: string
  showCard?: boolean
  gridLayout?: boolean
}

export function PublicNotesViewer({ userName, showCard = true, gridLayout = false }: PublicNotesViewerProps) {
  const { t } = useI18n()
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [isLoggedIn, setIsLoggedIn] = useState(false)

  const fetchNotes = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const response = await fetch(`/api/v1/profile/${userName}/notes`)
      
      if (!response.ok) {
        throw new Error(t('errors.failedToFetchNotes'))
      }
      
      const data = await response.json()
      setNotes(data.notes || [])
    } catch (err) {
      console.error('Error fetching notes:', err)
      setError(t('errors.failedToLoadNotes'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchNotes()
    // Fetch current user ID
    const fetchCurrentUser = async () => {
      try {
        const response = await fetch('/api/v1/user', {
          credentials: 'include'
        })
        if (response.ok) {
          const user = await response.json()
          setCurrentUserId(user.id)
          setIsLoggedIn(true)
        }
      } catch (err) {
        // User not logged in
        setIsLoggedIn(false)
      }
    }
    fetchCurrentUser()
  }, [userName])

  // Refresh notes when the component becomes visible (e.g., after friend status changes)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        fetchNotes()
      }
    }

    const handleFocus = () => {
      fetchNotes()
    }

    // Listen for custom friend status change events
    const handleFriendStatusChange = () => {
      fetchNotes()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleFocus)
    window.addEventListener('friendStatusChanged', handleFriendStatusChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('friendStatusChanged', handleFriendStatusChange)
    }
  }, [userName])

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
      onRefresh={fetchNotes}
      showHeader={!showCard}
      emptyMessage={t('publicProfile.noPublicNotes')}
      gridLayout={gridLayout}
      isLoggedIn={isLoggedIn}
      currentUserId={currentUserId}
      onNoteUpdated={fetchNotes}
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
