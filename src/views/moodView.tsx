'use client'
import { useState, useEffect, useMemo, useContext, useRef, useCallback } from 'react'
import useSWR from 'swr'
import { useRouter, usePathname } from 'next/navigation'

import { Slider } from "@/components/ui/slider"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { NotesList, Note } from "@/components/notesList"
import { getWeekNumber } from "@/app/helpers"
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel"
import { GlobalContext } from "@/lib/contexts"
import { useI18n } from "@/lib/contexts/i18n"
import { useNotesRefresh } from "@/lib/contexts/notesRefresh"
import { updateUser, generateInsight, handleCloseDates as handleCloseDatesUtil, isUserDataReady, useEnhancedLoadingState, useUserData, useDayData } from "@/lib/utils/userUtils"
import { MoodViewSkeleton } from "@/components/ui/skeletonLoader"
import { ContentLoadingWrapper } from '@/components/contentLoadingWrapper'
import { ContactCombobox } from "@/components/ui/contactCombobox"
import { ThingCombobox } from "@/components/ui/thingCombobox"
import { LifeEventCombobox } from "@/components/ui/lifeEventCombobox"
import { useDebounce } from "@/lib/hooks/useDebounce"
import { Plus } from "lucide-react"

interface MoodViewProps {
  timeframe?: string
  date?: string | null
  defaultTab?: 'mood' | 'notes' | 'details'
  filterNoteId?: string
}

export const MoodView = ({ timeframe = "day", date: propDate = null, defaultTab = "mood", filterNoteId }: MoodViewProps) => {
  const { session, setGlobalContext, theme, selectedDate: contextSelectedDate, setSelectedDate } = useContext(GlobalContext)
  const { t, locale } = useI18n()
  const { registerMutate, unregisterMutate } = useNotesRefresh()
  const router = useRouter()
  const pathname = usePathname()
  const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const today = new Date()
  const todayDate = today.toLocaleString('en-uk', { timeZone: userTimezone }).split(',')[0].split('/').reverse().join('-')
  
  // Convert Date to YYYY-MM-DD string format (using user's timezone)
  const dateToDateString = (date: Date | undefined): string => {
    if (!date) return todayDate
    // Use the same timezone-aware conversion as todayDate
    return date.toLocaleString('en-uk', { timeZone: userTimezone }).split(',')[0].split('/').reverse().join('-')
  }
  
  // Convert YYYY-MM-DD string to Date (treating as local date, not UTC)
  const dateStringToDate = (dateStr: string | null): Date | undefined => {
    if (!dateStr) return undefined
    try {
      // Parse YYYY-MM-DD and create date in local timezone
      const [year, month, day] = dateStr.split('-').map(Number)
      return new Date(year, month - 1, day)
    } catch {
      return undefined
    }
  }
  
  // Initialize fullDay from context or propDate or today
  const getInitialDate = (): string => {
    if (contextSelectedDate) {
      return dateToDateString(contextSelectedDate)
    }
    if (propDate) {
      return propDate
    }
    return todayDate
  }
  
  const [fullDay, setFullDay] = useState(() => {
    // Initialize on first render
    if (contextSelectedDate) {
      return dateToDateString(contextSelectedDate)
    }
    if (propDate) {
      return propDate
    }
    return todayDate
  })
  
  // Use ref to track if we're updating from context to prevent loops
  const isUpdatingFromContext = useRef(false)
  
  // Determine initial tab from URL path or defaultTab prop
  const getInitialTab = () => {
    if (pathname?.includes('/feel/mood')) return 'mood'
    if (pathname?.includes('/feel/notes')) return 'notes'
    if (pathname?.includes('/feel/details')) return 'details'
    // If on base /feel route, use defaultTab prop
    if (pathname?.endsWith('/feel') || pathname?.endsWith('/feel/')) return defaultTab
    return defaultTab
  }
  
  const [activeTab, setActiveTab] = useState<'mood' | 'notes' | 'details'>(getInitialTab())
  
  // Update activeTab when pathname changes
  useEffect(() => {
    const newTab = getInitialTab()
    setActiveTab(newTab)
  }, [pathname, defaultTab])
  
  // Handle tab change and update URL
  const handleTabChange = (value: string) => {
    const tab = value as 'mood' | 'notes' | 'details'
    setActiveTab(tab)
    
    // Update URL to match the selected tab
    // Extract locale and base path
    const pathParts = pathname?.split('/') || []
    const localeIndex = pathParts.findIndex(p => p === 'app')
    const basePath = localeIndex >= 0 
      ? pathParts.slice(0, localeIndex + 1).join('/')
      : ''
    const newPath = `${basePath}/feel/${tab}`
    router.push(newPath)
  } 

  
  // Sync with GlobalContext selectedDate - use context as source of truth
  useEffect(() => {
    if (contextSelectedDate) {
      const contextDateStr = dateToDateString(contextSelectedDate)
      if (contextDateStr !== fullDay) {
        isUpdatingFromContext.current = true
        setFullDay(contextDateStr)
        // Reset flag after state update
        setTimeout(() => {
          isUpdatingFromContext.current = false
        }, 0)
      }
    }
  }, [contextSelectedDate])
  
  // Update context when fullDay changes (from user interaction or propDate)
  // Skip if we're updating from context to avoid loops
  useEffect(() => {
    if (!isUpdatingFromContext.current && fullDay) {
      const fullDayDate = dateStringToDate(fullDay)
      // Only update if the date is actually different
      if (fullDayDate) {
        const contextTime = contextSelectedDate?.getTime()
        const fullDayTime = fullDayDate.getTime()
        if (contextTime !== fullDayTime) {
          setSelectedDate(fullDayDate)
        }
      }
    }
  }, [fullDay, contextSelectedDate, setSelectedDate]) // Include contextSelectedDate for comparison, but guard prevents loop
  
  // Update fullDay when propDate changes (for backward compatibility)
  useEffect(() => {
    if (propDate && propDate !== fullDay) {
      setFullDay(propDate)
    }
  }, [propDate])
  
  // Use fullDay directly as it's already in YYYY-MM-DD format
  const date = fullDay || todayDate
  const year = Number(date.split('-')[0])
  const [weekNumber, setWeekNumber] = useState(getWeekNumber(today)[1])

  // Fetch day data from GlobalContext using useDayData hook
  const { data: dayData, isLoading: dayLoading, mutate: mutateDay } = useDayData(date, !!session?.user)

  const serverMood = useMemo(() => dayData?.day?.mood || {}, [dayData?.day?.mood])
  const serverMoodContacts = useMemo(() => dayData?.day?.contacts || [], [dayData?.day?.contacts])
  const serverMoodThings = useMemo(() => dayData?.day?.things || [], [dayData?.day?.things])
  const serverMoodLifeEvents = useMemo(() => dayData?.day?.lifeEvents || [], [dayData?.day?.lifeEvents])

  const [insight, setInsight] = useState({})
  const [contacts, setContacts] = useState<any[]>([])
  const [things, setThings] = useState<any[]>([])
  const [lifeEvents, setLifeEvents] = useState<any[]>([])
  const [moodContacts, setMoodContacts] = useState<any[]>([])
  const [moodThings, setMoodThings] = useState<any[]>([])
  const [moodLifeEvents, setMoodLifeEvents] = useState<any[]>([])
  const [optimisticMoodContacts, setOptimisticMoodContacts] = useState<any[]>([])
  const [optimisticMoodThings, setOptimisticMoodThings] = useState<any[]>([])
  const [newLifeEventText, setNewLifeEventText] = useState('')
  const [notes, setNotes] = useState<Note[]>([])

  // Initialize mood contacts from server data
  useEffect(() => {
    const contacts = serverMoodContacts || []
    setMoodContacts(contacts)
    setOptimisticMoodContacts(contacts)
  }, [serverMoodContacts])

  // Initialize mood things from server data
  useEffect(() => {
    const things = serverMoodThings || []
    setMoodThings(things)
    setOptimisticMoodThings(things)
  }, [serverMoodThings])

  // Initialize mood life events from server data
  useEffect(() => {
    setMoodLifeEvents(serverMoodLifeEvents || [])
  }, [serverMoodLifeEvents])


  const openDays = useMemo(() => {
    return session?.user?.entries && session?.user?.entries[year] && session?.user?.entries[year].days && Object.values(session?.user?.entries[year].days).filter((day) => {
   return day.status === "Open" && day.date !== date }).sort()
  }, [JSON.stringify(session), date])

  const [mood, setMood] = useState(serverMood)

  // Update mood state when serverMood changes (due to date change)
  useEffect(() => {
    setMood(serverMood)
  }, [serverMood])




  // Fetch contacts
  const { data: contactsData, mutate: mutateContacts, isLoading: contactsLoading } = useSWR(
    session?.user ? `/api/v1/persons` : null,
    async () => {
      const response = await fetch('/api/v1/persons')
      if (response.ok) {
        const data = await response.json()
        setContacts(data.contacts || [])
        return data
      }
      return { contacts: [] }
    }
  )

  // Fetch things
  const { data: thingsData, mutate: mutateThings, isLoading: thingsLoading } = useSWR(
    session?.user ? `/api/v1/things` : null,
    async () => {
      const response = await fetch('/api/v1/things')
      if (response.ok) {
        const data = await response.json()
        setThings(data.things || [])
        return data
      }
      return { things: [] }
    }
  )

  // Fetch life events
  const { data: lifeEventsData, mutate: mutateLifeEvents, isLoading: lifeEventsLoading } = useSWR(
    session?.user ? `/api/v1/events` : null,
    async () => {
      const response = await fetch('/api/v1/events')
      if (response.ok) {
        const data = await response.json()
        setLifeEvents(data.lifeEvents || [])
        return data
      }
      return { lifeEvents: [] }
    }
  )

  // Fetch notes for the selected date
  const { data: notesData, mutate: mutateNotes, isLoading: notesLoading, error: notesError } = useSWR(
    session?.user ? `/api/v1/notes${filterNoteId ? `?noteId=${filterNoteId}` : ''}` : null,
    async () => {
      try {
        const url = filterNoteId ? `/api/v1/notes?noteId=${filterNoteId}` : '/api/v1/notes'
        const response = await fetch(url)
        if (!response.ok) {
          console.error('Failed to fetch notes:', response.status, response.statusText)
          return { notes: [] }
        }
        const data = await response.json()
        return data
      } catch (error) {
        console.error('Error fetching notes:', error)
        return { notes: [] }
      }
    }
  )

  // Register the mutate function for notes refresh
  useEffect(() => {
    registerMutate('moodView-notes', mutateNotes)
    return () => {
      unregisterMutate('moodView-notes')
    }
  }, [mutateNotes, registerMutate, unregisterMutate])

  // Update selected date to match filtered note's date when filterNoteId is provided
  useEffect(() => {
    if (filterNoteId && notesData?.notes && !notesLoading) {
      const filteredNote = notesData.notes.find((note: Note) => note.id === filterNoteId)
      if (filteredNote && filteredNote.date) {
        const noteDate = String(filteredNote.date).split('T')[0]
        // Only update if the date is different to avoid unnecessary updates
        if (noteDate !== date) {
          setFullDay(noteDate)
        }
      }
    }
  }, [filterNoteId, notesData, notesLoading, date])

  // Update notes when date changes or notes data is loaded
  useEffect(() => {
    if (notesError) {
      console.error('Notes fetch error:', notesError)
      setNotes([])
      return
    }
    
    if (notesData?.notes) {
      // Filter notes by the selected date (date format should match YYYY-MM-DD)
      // Note: the date field in notes might be stored as a string in YYYY-MM-DD format
      // Always include the note matching filterNoteId, even if it's from a different date
      const filteredNotes = notesData.notes
        .filter((note: Note) => {
          // Always include the note if it matches filterNoteId
          if (filterNoteId && note.id === filterNoteId) {
            return true
          }
          // For other notes, filter by the selected date
          const noteDate = note.date ? String(note.date).split('T')[0] : null
          return noteDate === date
        })
        .sort((a: Note, b: Note) => {
          // Sort: matching filterNoteId first, then by createdAt descending (newest first)
          if (filterNoteId) {
            const aMatches = a.id === filterNoteId
            const bMatches = b.id === filterNoteId
            if (aMatches && !bMatches) return -1
            if (!aMatches && bMatches) return 1
          }
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        })
      setNotes(filteredNotes)
    } else if (notesData && !notesLoading) {
      // If data is loaded but no notes array, set empty array
      setNotes([])
    }
  }, [date, notesData, notesLoading, notesError, filterNoteId])

  // Ensure contacts are loaded from SWR data
  useEffect(() => {
    if (contactsData?.contacts) {
      setContacts(contactsData.contacts)
    }
  }, [contactsData])

  // Ensure things are loaded from SWR data
  useEffect(() => {
    if (thingsData?.things) {
      setThings(thingsData.things)
    }
  }, [thingsData])

  // Ensure life events are loaded from SWR data
  useEffect(() => {
    if (lifeEventsData?.lifeEvents) {
      setLifeEvents(lifeEventsData.lifeEvents)
    }
  }, [lifeEventsData])

  // Helper function to save day data to Day API
  // Now supports partial mood updates - only sends provided fields
  const saveDayData = useCallback(async (moodUpdates?: Record<string, number>, contactsData?: any[], thingsData?: any[], lifeEventsData?: any[]) => {
    try {
      const payload: any = {
        date: date
      }
      
      // Only include mood if there are updates
      if (moodUpdates && Object.keys(moodUpdates).length > 0) {
        payload.mood = moodUpdates
      }
      
      // Include other data if provided
      if (contactsData !== undefined) {
        payload.contacts = contactsData
      }
      if (thingsData !== undefined) {
        payload.things = thingsData
      }
      if (lifeEventsData !== undefined) {
        payload.lifeEvents = lifeEventsData
      }

      const response = await fetch('/api/v1/days', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      })

      // Don't manually refresh - rely on SWR polling every 30 seconds
      if (!response.ok) {
        throw new Error('Failed to save day data')
      }
    } catch (error) {
      console.error('Error saving day data:', error)
    }
  }, [date])

  // Create a stable function that only saves mood updates (no contacts/things/lifeEvents)
  const saveMoodOnly = useCallback(async (moodUpdates: Record<string, number>) => {
    // Explicitly only pass mood updates, nothing else
    await saveDayData(moodUpdates, undefined, undefined, undefined)
  }, [saveDayData])

  // Create batched debounced save function for mood updates ONLY
  // This should only send mood data, never contacts/things/lifeEvents
  const debouncedSaveMood = useDebounce(
    saveMoodOnly,
    5000,
    { batched: true }
  )

  // Function to handle individual slider changes with 5-second batched debouncing
  const handleMoodSliderChange = (field: string, value: number) => {
    // Update the local mood state for immediate UI feedback
    setMood(prev => ({...prev, [field]: value}))
    // Trigger batched debounced save (will collect all changes within 5 seconds)
    debouncedSaveMood({ [field]: value })
  }

  const handleSubmit = async (value: number, field: string) => {
    const updatedMood = {[field]: value}
    setMood(prev => ({...prev, [field]: value}))
    await saveDayData(updatedMood)
  }

  // Helper to find what changed between old and new arrays
  const getArrayDiff = useCallback((oldArray: any[], newArray: any[]) => {
    const oldIds = new Set(oldArray.map(item => item.id || item))
    const newIds = new Set(newArray.map(item => item.id || item))
    
    // Find added items (in new but not in old)
    const added = newArray.filter(item => {
      const id = item.id || item
      return !oldIds.has(id)
    })
    
    // Find removed items (in old but not in new)
    const removed = oldArray.filter(item => {
      const id = item.id || item
      return !newIds.has(id)
    })
    
    // Find modified items (same ID but different quality)
    const modified = newArray.filter(newItem => {
      const newId = newItem.id || newItem
      const oldItem = oldArray.find(oldItem => (oldItem.id || oldItem) === newId)
      return oldItem && (oldItem.quality !== newItem.quality)
    })
    
    return { added, removed, modified }
  }, [])

  // Create stable functions that only save specific field updates
  const saveContactsOnly = useCallback(async (contactsData: any[]) => {
    await saveDayData(undefined, contactsData, undefined, undefined)
  }, [saveDayData])

  const saveThingsOnly = useCallback(async (thingsData: any[]) => {
    await saveDayData(undefined, undefined, thingsData, undefined)
  }, [saveDayData])

  const saveLifeEventsOnly = useCallback(async (lifeEventsData: any[]) => {
    await saveDayData(undefined, undefined, undefined, lifeEventsData)
  }, [saveDayData])

  // Create batched debounced save functions for contacts, things, and lifeEvents
  // These will batch multiple changes within 5 seconds and send only the final state
  const debouncedSaveContacts = useDebounce(
    saveContactsOnly,
    5000,
    { batched: false } // Send the latest full array after debounce
  )

  const debouncedSaveThings = useDebounce(
    saveThingsOnly,
    5000,
    { batched: false }
  )

  const debouncedSaveLifeEvents = useDebounce(
    saveLifeEventsOnly,
    5000,
    { batched: false }
  )

  const handleMoodContactsChange = async (newMoodContacts: any[]) => {
    // Update both optimistic and server state immediately
    setOptimisticMoodContacts(newMoodContacts)
    setMoodContacts(newMoodContacts)
    // Trigger debounced save (will batch multiple changes within 5 seconds)
    // Only the latest array will be sent after 5 seconds of inactivity
    debouncedSaveContacts(newMoodContacts)
  }

  const handleMoodThingsChange = async (newMoodThings: any[]) => {
    // Update both optimistic and server state immediately
    setOptimisticMoodThings(newMoodThings)
    setMoodThings(newMoodThings)
    // Trigger debounced save (will batch multiple changes within 5 seconds)
    // Only the latest array will be sent after 5 seconds of inactivity
    debouncedSaveThings(newMoodThings)
  }

  const handleMoodLifeEventsChange = async (newMoodLifeEvents: any[]) => {
    // Update state immediately
    setMoodLifeEvents(newMoodLifeEvents)
    // Trigger debounced save (will batch multiple changes within 5 seconds)
    // Only the latest array will be sent after 5 seconds of inactivity
    debouncedSaveLifeEvents(newMoodLifeEvents)
  }

  const handleAddLifeEvent = async () => {
    if (!newLifeEventText.trim()) return

    try {
      const response = await fetch('/api/v1/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: newLifeEventText.trim(),
          quality: 3 // Default quality rating
        }),
      })

      if (response.ok) {
        const result = await response.json()
        const lifeEvent = result.lifeEvent

        // Add to selected life events immediately
        const lifeEventRef = {
          id: lifeEvent.id,
          name: lifeEvent.name,
          quality: 3
        }
        setMoodLifeEvents([...moodLifeEvents, lifeEventRef])

        // Clear the textarea
        setNewLifeEventText('')

        // Refresh the life events list
        mutateLifeEvents()

        // Save to day data
        await saveDayData(undefined, undefined, undefined, [...moodLifeEvents, lifeEventRef])
      }
    } catch (error) {
      console.error('Error adding life event:', error)
    }
  }




  const handleEditDay = (date: string) => {
    setFullDay(date)
    // Also update context
    const dateObj = dateStringToDate(date)
    if (dateObj) {
      setSelectedDate(dateObj)
    }
  }

  const { refreshUser } = useUserData()

  const handleCloseDates = async (values) => {
    await handleCloseDatesUtil(values, undefined, fullDay)
    await refreshUser()
  }

 
  useEffect(() => {
    // Only fetch hint; skip user refresh here to avoid duplicate GETs
    generateInsight(setInsight, 'test', locale)
  }, [locale])

  // Use enhanced loading state to prevent flashing
  const isDataLoading = useEnhancedLoadingState(dayLoading, session)

  if (isDataLoading) {
    return <MoodViewSkeleton />
  }

  return (
    <ContentLoadingWrapper>
      <div key={JSON.stringify(serverMood)} className="w-full m-auto p-4">
        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger 
              value="mood"
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              {t('common.mood')}
            </TabsTrigger>
            <TabsTrigger 
              value="notes"
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              {t('publicProfile.notes')}
            </TabsTrigger>
            <TabsTrigger 
              value="details"
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              {t('common.details')}
            </TabsTrigger>
          </TabsList>

          {/* Mood Tab */}
          <TabsContent value="mood" className="mt-4">
            <div className="mb-16">
              <small>{insight?.gratitudeAnalysis}</small>
            </div>
            <Slider className="mb-4" value={[mood.gratitude || 0]} max={5} step={0.5} onValueChange={(e) => handleMoodSliderChange("gratitude", e[0])} />
            <h3 className="mt-4 text-center">{t('charts.gratitude')}</h3>
            <div className="my-16">
              <small>{insight?.optimismAnalysis}</small>
            </div>
            <Slider className="mb-4" value={[mood.optimism || 0]} max={5} step={0.5} onValueChange={(e) => handleMoodSliderChange("optimism", e[0])} />
            <h3 className="mt-4 text-center">{t('charts.optimism')}</h3>
            <div className="my-16">
              <small>{insight?.restednessAnalysis}</small>
            </div>
            <Slider className="mb-4" value={[mood.restedness || 0]} max={5} step={0.5} onValueChange={(e) => handleMoodSliderChange("restedness", e[0])} />
            <h3 className="mt-4 text-center">{t('charts.restedness')}</h3>
            <div className="my-16">
              <small>{insight?.toleranceAnalysis}</small>
            </div>
            <Slider className="mb-4" value={[mood.tolerance || 0]} max={5} step={0.5} onValueChange={(e) => handleMoodSliderChange("tolerance", e[0])} />
            <h3 className="mt-4 text-center">{t('charts.tolerance')}</h3>
            <div className="my-16">
              <small>{insight?.selfEsteemAnalysis}</small>
            </div>
            <Slider className="mb-4" value={[mood.selfEsteem || 0]} max={5} step={0.5} onValueChange={(e) => handleMoodSliderChange("selfEsteem", e[0])} />
            <h3 className="mt-4 text-center">{t('charts.selfEsteem')}</h3>
            <div className="my-16">
              <small>{insight?.trustAnalysis}</small>
            </div>
            <Slider className="mb-4" value={[mood?.trust || 0]} max={5} step={0.5} onValueChange={(e) => handleMoodSliderChange("trust", e[0])} />
            <h3 className="mt-4 text-center">{t('charts.trust')}</h3>
          </TabsContent>

          {/* Notes Tab */}
          <TabsContent value="notes" className="mt-4">
            <NotesList
              notes={notes}
              loading={notesLoading}
              onRefresh={() => mutateNotes()}
              showHeader={false}
              emptyMessage={t('mood.noNotesForDate')}
              isLoggedIn={!!session?.user}
              currentUserId={session?.user?.id || null}
              onNoteUpdated={() => mutateNotes()}
              filterNoteId={filterNoteId}
            />
          </TabsContent>

          {/* Details Tab */}
          <TabsContent value="details" className="mt-4">
            {/* Life Events Management for Mood */}
            <div className="mb-8 p-4 border rounded-lg bg-transparent border-body">
              <h3 className="text-lg font-semibold mb-4 text-body">{t('social.lifeEventsInfluencedMood')}</h3>
              
              {/* Simple textarea with submit button for adding life events */}
              <LifeEventCombobox
                lifeEvents={lifeEvents}
                selectedLifeEvents={moodLifeEvents}
                onLifeEventsChange={handleMoodLifeEventsChange}
                onLifeEventsRefresh={() => {
                  // Trigger a refresh of the life events data
                  mutateLifeEvents()
                }}
              />
              
              {/* Impact Sliders for Selected Life Events */}
              {moodLifeEvents.length > 0 && (
                <div className="mt-6 space-y-4">
                  <h4 className="text-sm font-medium text-muted-foreground">{t('social.lifeEventsImpactRatings')}</h4>
                  {moodLifeEvents.map((lifeEvent) => (
                    <div key={lifeEvent.id} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{lifeEvent.name}</span>
                        <span className="text-xs text-muted-foreground">{lifeEvent.quality || 3}/5</span>
                      </div>
                      <Slider
                        value={[lifeEvent.quality || 3]}
                        onValueChange={(value) => {
                          const updatedLifeEvents = moodLifeEvents.map(le => 
                            le.id === lifeEvent.id 
                              ? { ...le, quality: value[0] }
                              : le
                          )
                          setMoodLifeEvents(updatedLifeEvents)
                          // Save to database
                          handleMoodLifeEventsChange(updatedLifeEvents)
                        }}
                        max={5}
                        min={0}
                        step={0.5}
                        className="w-full"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* People Management for Mood */}
            <div className="mb-8 p-4 border rounded-lg">
              <h3 className="text-lg font-semibold mb-4">{t('social.peopleInfluencedMood')}</h3>
              {!contactsLoading && (
                <ContactCombobox
                  contacts={contacts}
                  selectedContacts={moodContacts}
                  onContactsChange={handleMoodContactsChange}
                  onContactsRefresh={() => {
                    // Trigger a refresh of the contacts data
                    mutateContacts()
                  }}
                />
              )}
              
              {/* Interaction Quality Sliders for Selected Contacts */}
              {optimisticMoodContacts.length > 0 && (
                <div className="mt-6 space-y-4">
                  <h4 className="text-sm font-medium text-muted-foreground">{t('social.interactionQualityRatings')}</h4>
                  {optimisticMoodContacts.map((contact) => (
                    <div key={contact.id} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{contact.name}</span>
                        <span className="text-xs text-muted-foreground">{contact.quality || 3}/5</span>
                      </div>
                      <Slider
                        value={[contact.quality || 3]}
                        onValueChange={(value) => {
                          const updatedContacts = optimisticMoodContacts.map(c => 
                            c.id === contact.id 
                              ? { ...c, quality: value[0] }
                              : c
                          )
                          // Optimistic update for immediate UI response
                          setOptimisticMoodContacts(updatedContacts)
                          // Also update the server state
                          setMoodContacts(updatedContacts)
                          // Save to database
                          handleMoodContactsChange(updatedContacts)
                        }}
                        max={5}
                        min={0}
                        step={0.5}
                        className="w-full"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Things Management for Mood */}
            <div className="mb-8 p-4 border rounded-lg bg-transparent border-body">
              <h3 className="text-lg font-semibold mb-4 text-body">{t('social.thingsInfluencedMood')}</h3>
              {!thingsLoading && (
                <ThingCombobox
                  things={things}
                  selectedThings={moodThings}
                  onThingsChange={handleMoodThingsChange}
                  onThingsRefresh={() => {
                    // Trigger a refresh of the things data
                    mutateThings()
                  }}
                />
              )}
              
              {/* Interaction Quality Sliders for Selected Things */}
              {optimisticMoodThings.length > 0 && (
                <div className="mt-6 space-y-4">
                  <h4 className="text-sm font-medium text-muted-foreground">{t('social.thingsInteractionQualityRatings')}</h4>
                  {optimisticMoodThings.map((thing) => (
                    <div key={thing.id} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{thing.name}</span>
                        <span className="text-xs text-muted-foreground">{thing.quality || 3}/5</span>
                      </div>
                      <Slider
                        value={[thing.quality || 3]}
                        onValueChange={(value) => {
                          const updatedThings = optimisticMoodThings.map(t => 
                            t.id === thing.id 
                              ? { ...t, quality: value[0] }
                              : t
                          )
                          // Optimistic update for immediate UI response
                          setOptimisticMoodThings(updatedThings)
                          // Also update the server state
                          setMoodThings(updatedThings)
                          // Save to database
                          handleMoodThingsChange(updatedThings)
                        }}
                        max={5}
                        min={0}
                        step={0.5}
                        className="w-full"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </ContentLoadingWrapper>
  )
}