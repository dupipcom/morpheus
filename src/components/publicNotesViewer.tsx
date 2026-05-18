'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { NotesList } from "@/components/notesList"
import { useI18n } from '@/lib/contexts/i18n'
import { useProfileNotes } from '@/lib/hooks/useProfile'
import { useUserData } from '@/lib/utils/userUtils'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger
} from '@/components/ui/dropdownMenu'

interface PublicNotesViewerProps {
  userName: string
  showCard?: boolean
  gridLayout?: boolean
}

export function PublicNotesViewer({ userName, showCard = true, gridLayout = false }: PublicNotesViewerProps) {
  const { t } = useI18n()
  const [visibilityFilter, setVisibilityFilter] = useState<Array<'PUBLIC' | 'PRIVATE'>>(['PUBLIC'])
  const [sortBy, setSortBy] = useState<'date' | 'most_relevant'>('most_relevant')
  const { notes, isLoading: loading, error: notesError, refreshNotes } = useProfileNotes(userName, true, {
    visibility: visibilityFilter,
    sort: sortBy
  })
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
  const visibilityLabel = visibilityFilter.length === 2
    ? 'Public + Private'
    : visibilityFilter.includes('PRIVATE')
      ? 'Private'
      : 'Public'

  const toggleVisibility = (value: 'PUBLIC' | 'PRIVATE') => {
    setVisibilityFilter(prev => {
      if (prev.includes(value)) {
        if (prev.length === 1) return prev
        return prev.filter(item => item !== value)
      }
      return [...prev, value]
    })
  }

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
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="justify-start w-full sm:w-[220px]">
              {`Visibility: ${visibilityLabel}`}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuCheckboxItem
              checked={visibilityFilter.includes('PUBLIC')}
              onCheckedChange={() => toggleVisibility('PUBLIC')}
            >
              Public
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={visibilityFilter.includes('PRIVATE')}
              onCheckedChange={() => toggleVisibility('PRIVATE')}
            >
              Private
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Select value={sortBy} onValueChange={(value) => setSortBy(value as 'date' | 'most_relevant')}>
          <SelectTrigger className="w-full sm:w-[220px]">
            <SelectValue placeholder="Sort" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="date">Date</SelectItem>
            <SelectItem value="most_relevant">Most Relevant</SelectItem>
          </SelectContent>
        </Select>
      </div>

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
        sortBy={sortBy}
      />
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
