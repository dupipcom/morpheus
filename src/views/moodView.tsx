'use client'
import { useState, useEffect, useMemo, useContext, useRef } from 'react'
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
import { updateUser, generateInsight, handleCloseDates as handleCloseDatesUtil, isUserDataReady, useEnhancedLoadingState, useUserData } from "@/lib/userUtils"
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
  const { session, setGlobalContext, theme } = useContext(GlobalContext)
  const { t, locale } = useI18n()
  const { registerMutate, unregisterMutate } = useNotesRefresh()
  const router = useRouter()
  const pathname = usePathname()
  const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const today = new Date()
  const todayDate = today.toLocaleString('en-uk', { timeZone: userTimezone }).split(',')[0].split('/').reverse().join('-')
  const [fullDay, setFullDay] = useState(todayDate)
  
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

  
  // Update fullDay when propDate changes
  useEffect(() => {
    if (propDate) {
      setFullDay(propDate)
    }
  }, [propDate])
  
  const date = fullDay ? new Date(fullDay).toISOString().split('T')[0] : todayDate
  const year = Number(date.split('-')[0])
  const [weekNumber, setWeekNumber] = useState(getWeekNumber(today)[1])

  // Fetch day data from Day API
  const { data: dayData, mutate: mutateDay, isLoading: dayLoading } = useSWR(
    session?.user ? `/api/v1/days?date=${date}` : null,
    async () => {
      const response = await fetch(`/api/v1/days?date=${date}`)
      if (response.ok) {
        const data = await response.json()
        return data
      }
      return { day: null }
    }
  )

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
  const [pendingMoodChanges, setPendingMoodChanges] = useState({})
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Update mood state when serverMood changes (due to date change)
  useEffect(() => {
    setMood(serverMood)
    setPendingMoodChanges({})
    // Clear any pending debounce when date changes
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = null
    }
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
    session?.user ? `/api/v1/notes` : null,
    async () => {
      try {
        const response = await fetch('/api/v1/notes')
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
      const filteredNotes = notesData.notes
        .filter((note: Note) => {
          // Handle both string and Date comparisons
          const noteDate = note.date ? String(note.date).split('T')[0] : null
          return noteDate === date
        })
        .sort((a: Note, b: Note) => {
          // Sort by createdAt descending (newest first)
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        })
      setNotes(filteredNotes)
    } else if (notesData && !notesLoading) {
      // If data is loaded but no notes array, set empty array
      setNotes([])
    }
  }, [date, notesData, notesLoading, notesError])

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
  const saveDayData = async (moodData?: any, contactsData?: any[], thingsData?: any[], lifeEventsData?: any[]) => {
    try {
      const payload: any = {
        date: date,
        mood: moodData || mood,
        contacts: contactsData || moodContacts,
        things: thingsData || moodThings,
        lifeEvents: lifeEventsData || moodLifeEvents
      }

      const response = await fetch('/api/v1/days', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      })

      if (response.ok) {
        await mutateDay()
      }
    } catch (error) {
      console.error('Error saving day data:', error)
    }
  }

  // Create debounced version of handleSubmit for sliders
  const debouncedHandleSubmit = useDebounce(async (value, field) => {
    const updatedMood = {...mood, [field]: value}
    setMood(updatedMood)
    await saveDayData(updatedMood)
  }, 3000)

  // Function to handle individual slider changes with debouncing
  const handleMoodSliderChange = (field, value) => {
    // Update the pending changes
    setPendingMoodChanges(prev => ({...prev, [field]: value}))
    // Update the local mood state for immediate UI feedback
    setMood(prev => ({...prev, [field]: value}))
    
    // Clear existing timer if any
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }
    
    // Set new timer - will only execute after 3000ms of no interactions
    debounceTimerRef.current = setTimeout(() => {
      // Use functional updates to get the latest state values
      setMood(currentMood => {
        setPendingMoodChanges(currentPending => {
          // Aggregate all pending changes with current mood state
          const aggregatedMood = {...currentMood, ...currentPending}
          
          // Save to backend
          saveDayData(aggregatedMood).then(() => {
            debounceTimerRef.current = null
          })
          
          return {}
        })
        return currentMood
      })
    }, 3000)
  }


  const handleSubmit = async (value, field) => {
    const updatedMood = {...mood, [field]: value}
    setMood(updatedMood)
    await saveDayData(updatedMood)
  }

  // Create debounced version of handleMoodContactsChange for contact interaction sliders
  const debouncedHandleMoodContactsChange = useDebounce(async (newMoodContacts) => {
    // Update both optimistic and server state
    setOptimisticMoodContacts(newMoodContacts)
    setMoodContacts(newMoodContacts)
    await saveDayData(undefined, newMoodContacts)
  }, 500)

  const handleMoodContactsChange = async (newMoodContacts) => {
    // Update both optimistic and server state
    setOptimisticMoodContacts(newMoodContacts)
    setMoodContacts(newMoodContacts)
    await saveDayData(undefined, newMoodContacts)
  }

  // Create debounced version of handleMoodThingsChange for thing interaction sliders
  const debouncedHandleMoodThingsChange = useDebounce(async (newMoodThings) => {
    // Update both optimistic and server state
    setOptimisticMoodThings(newMoodThings)
    setMoodThings(newMoodThings)
    await saveDayData(undefined, undefined, newMoodThings)
  }, 500)

  const handleMoodThingsChange = async (newMoodThings) => {
    // Update both optimistic and server state
    setOptimisticMoodThings(newMoodThings)
    setMoodThings(newMoodThings)
    await saveDayData(undefined, undefined, newMoodThings)
  }

  // Create debounced version of handleMoodLifeEventsChange for life event interaction sliders
  const debouncedHandleMoodLifeEventsChange = useDebounce(async (newMoodLifeEvents) => {
    setMoodLifeEvents(newMoodLifeEvents)
    await saveDayData(undefined, undefined, undefined, newMoodLifeEvents)
  }, 500)

  const handleMoodLifeEventsChange = async (newMoodLifeEvents) => {
    setMoodLifeEvents(newMoodLifeEvents)
    await saveDayData(undefined, undefined, undefined, newMoodLifeEvents)
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




  const handleEditDay = (date) => {
    setFullDay(date)
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
            <div className="mb-12">
              <h3 className="mt-0 mb-4">{t('charts.gratitude')}</h3>
              <small>{insight?.gratitudeAnalysis}</small>
            </div>
            <Slider className="mb-24" defaultValue={[serverMood.gratitude || 0]} max={5} step={0.5} onValueChange={(e) => handleMoodSliderChange("gratitude", e[0])} />
            <div className="my-12">
              <h3 className="mt-8 mb-4">{t('charts.optimism')}</h3>
              <small>{insight?.optimismAnalysis}</small>
            </div>
            <Slider className="mb-24" defaultValue={[serverMood.optimism || 0]} max={5} step={0.5} onValueChange={(e) => handleMoodSliderChange("optimism", e[0])} />
            <div className="my-12">
              <h3 className="mt-8 mb-4">{t('charts.restedness')}</h3>
              <small>{insight?.restednessAnalysis}</small>
            </div>
            <Slider className="mb-24" defaultValue={[serverMood.restedness || 0]} max={5} step={0.5} onValueChange={(e) => handleMoodSliderChange("restedness", e[0])} />
            <div className="my-12">
              <h3 className="mt-8 mb-4">{t('charts.tolerance')}</h3>
              <small>{insight?.toleranceAnalysis}</small>
            </div>
            <Slider className="mb-24" defaultValue={[serverMood.tolerance || 0]} max={5} step={0.5} onValueChange={(e) => handleMoodSliderChange("tolerance", e[0])} />
            <div className="my-12">
              <h3 className="mb-4">{t('charts.selfEsteem')}</h3>
              <small>{insight?.selfEsteemAnalysis}</small>
            </div>
            <Slider className="mb-24" defaultValue={[serverMood.selfEsteem || 0]} max={5} step={0.5} onValueChange={(e) => handleMoodSliderChange("selfEsteem", e[0])} />
            <div className="my-12">
              <h3 className="mt-8 mb-4">{t('charts.trust')}</h3>
              <small>{insight?.trustAnalysis}</small>
            </div>
            <Slider className="mb-8" defaultValue={[serverMood?.trust || 0]} max={5} step={0.5} onValueChange={(e) => handleMoodSliderChange("trust", e[0])} />
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
                          // Use debounced handler to save to database
                          debouncedHandleMoodLifeEventsChange(updatedLifeEvents)
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
                          // Use debounced handler to save to database
                          debouncedHandleMoodContactsChange(updatedContacts)
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
                          // Use debounced handler to save to database
                          debouncedHandleMoodThingsChange(updatedThings)
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