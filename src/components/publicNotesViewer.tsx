'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { NotesList } from "@/components/notesList"
import { useI18n } from '@/lib/contexts/i18n'
import { useProfileNotes, NoteVisibility } from '@/lib/hooks/useProfile'
import { useUserData } from '@/lib/utils/userUtils'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Lock, Users, UserCheck, Globe, Sparkles } from 'lucide-react'
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
  const getTranslatedLabel = (key: string, fallback: string): string => {
    const translated = t(key)
    return translated === key ? fallback : translated
  }
  const [visibilityFilter, setVisibilityFilter] = useState<Array<NoteVisibility>>(['PUBLIC'])
  const [sortBy, setSortBy] = useState<'date' | 'most_relevant'>('most_relevant')
  const [isReversed, setIsReversed] = useState(false)
  const { notes, isLoading: loading, error: notesError, refreshNotes, isOwnProfile } = useProfileNotes(userName, true, {
    visibility: visibilityFilter,
    sort: sortBy,
    order: isReversed ? 'asc' : 'desc'
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
  const visibilityPrefixLabel = t('notes.changeVisibility')
  const sortLabel = getTranslatedLabel('notes.filters.sort', 'Sort')
  const sortByDateLabel = getTranslatedLabel('notes.filters.date', 'Date')
  const sortByMostRelevantLabel = getTranslatedLabel('notes.filters.mostRelevant', 'Most Relevant')

  // Build the list of visibility options to display based on the viewer's relationship
  const visibilityOptions: { value: NoteVisibility; label: string; icon: React.ReactNode }[] = [
    { value: 'PUBLIC', label: t('mood.publish.visibility.PUBLIC') || 'Public', icon: <Globe className="h-4 w-4" /> },
    ...(isLoggedIn ? [{ value: 'FRIENDS' as NoteVisibility, label: t('mood.publish.visibility.FRIENDS') || 'Friends', icon: <Users className="h-4 w-4" /> }] : []),
    ...(isLoggedIn ? [{ value: 'CLOSE_FRIENDS' as NoteVisibility, label: t('mood.publish.visibility.CLOSE_FRIENDS') || 'Close Friends', icon: <UserCheck className="h-4 w-4" /> }] : []),
    ...(isOwnProfile ? [{ value: 'PRIVATE' as NoteVisibility, label: t('mood.publish.visibility.PRIVATE') || 'Private', icon: <Lock className="h-4 w-4" /> }] : []),
    ...(isOwnProfile ? [{ value: 'AI_ENABLED' as NoteVisibility, label: t('mood.publish.visibility.AI_ENABLED') || 'AI Enabled', icon: <Sparkles className="h-4 w-4" /> }] : []),
  ]

  const visibilityLabel = (() => {
    if (visibilityFilter.length === 0) return t('mood.publish.visibility.PUBLIC') || 'Public'
    if (visibilityFilter.length === visibilityOptions.length) return t('notes.filters.all')
    return visibilityFilter
      .map(v => visibilityOptions.find(o => o.value === v)?.label || v)
      .join(', ')
  })()

  const toggleVisibility = (value: NoteVisibility) => {
    setVisibilityFilter(prev => {
      // Keep at least one option selected so the query always has a valid visibility filter.
      if (prev.length === 1 && prev.includes(value)) return prev
      if (prev.includes(value)) return prev.filter(item => item !== value)
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
            <Button
              variant="outline"
              className="justify-start gap-2 w-full sm:w-[220px]"
              aria-label={visibilityPrefixLabel}
            >
              <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="truncate">{visibilityLabel}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {visibilityOptions.map(option => (
              <DropdownMenuCheckboxItem
                key={option.value}
                checked={visibilityFilter.includes(option.value)}
                onCheckedChange={() => toggleVisibility(option.value)}
              >
                <span className="flex items-center gap-2">
                  {option.icon}
                  {option.label}
                </span>
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Select value={sortBy} onValueChange={(value) => setSortBy(value as 'date' | 'most_relevant')}>
          <SelectTrigger className="w-full sm:w-[220px]">
            <SelectValue placeholder={sortLabel} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="date">{sortByDateLabel}</SelectItem>
            <SelectItem value="most_relevant">{sortByMostRelevantLabel}</SelectItem>
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
        isReversed={isReversed}
        onToggleReverseOrder={() => setIsReversed(prev => !prev)}
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
