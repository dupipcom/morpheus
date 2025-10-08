'use client'
import { useState, useEffect, useMemo, useContext } from 'react'
import useSWR from 'swr'

import { Slider } from "@/components/ui/slider"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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
import { updateUser, generateInsight, handleCloseDates as handleCloseDatesUtil, handleMoodSubmit, isUserDataReady, useEnhancedLoadingState } from "@/lib/userUtils"
import { MoodViewSkeleton } from "@/components/ui/skeleton-loader"
import { ContentLoadingWrapper } from '@/components/ContentLoadingWrapper'
import { ContactCombobox } from "@/components/ui/contact-combobox"
import { ThingCombobox } from "@/components/ui/thing-combobox"
import { LifeEventCombobox } from "@/components/ui/life-event-combobox"
import { useDebounce } from "@/lib/hooks/useDebounce"
import { Plus } from "lucide-react"

export const MoodView = ({ timeframe = "day", date: propDate = null }) => {
  const { session, setGlobalContext, theme } = useContext(GlobalContext)
  const { t, locale } = useI18n()
  const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const today = new Date()
  const todayDate = today.toLocaleString('en-uk', { timeZone: userTimezone }).split(',')[0].split('/').reverse().join('-')
  const [fullDay, setFullDay] = useState(todayDate) 

  
  // Update fullDay when propDate changes
  useEffect(() => {
    if (propDate) {
      setFullDay(propDate)
    }
  }, [propDate])
  
  const date = fullDay ? new Date(fullDay).toISOString().split('T')[0] : todayDate
  const year = Number(date.split('-')[0])
  const [weekNumber, setWeekNumber] = useState(getWeekNumber(today)[1])

  const serverMood = useMemo(() => (session?.user?.entries && session?.user?.entries[year] && session?.user?.entries[year].days && session?.user?.entries[year].days[date] && session?.user?.entries[year].days[date].mood) || {}, [fullDay, JSON.stringify(session)])

  const serverText = useMemo(() => (session?.user?.entries && session?.user?.entries[year] && session?.user?.entries[year].days && session?.user?.entries[year].days[date] && session?.user?.entries[year].days[date].text) || "", [fullDay, JSON.stringify(session)])

  const serverMoodContacts = useMemo(() => {
    const dayEntry = session?.user?.entries?.[year]?.days?.[date]
    return dayEntry?.contacts || []
  }, [session?.user?.entries, year, date, session?.user?.entries?.[year]?.days?.[date]?.contacts])

  const serverMoodThings = useMemo(() => {
    const dayEntry = session?.user?.entries?.[year]?.days?.[date]
    return dayEntry?.things || []
  }, [session?.user?.entries, year, date, session?.user?.entries?.[year]?.days?.[date]?.things])

  const serverMoodLifeEvents = useMemo(() => {
    const dayEntry = session?.user?.entries?.[year]?.days?.[date]
    return dayEntry?.lifeEvents || []
  }, [session?.user?.entries, year, date, session?.user?.entries?.[year]?.days?.[date]?.lifeEvents])

  const [insight, setInsight] = useState({})
  const [contacts, setContacts] = useState<any[]>([])
  const [things, setThings] = useState<any[]>([])
  const [lifeEvents, setLifeEvents] = useState<any[]>([])
  const [moodContacts, setMoodContacts] = useState<any[]>([])
  const [moodThings, setMoodThings] = useState<any[]>([])
  const [moodLifeEvents, setMoodLifeEvents] = useState<any[]>([])
  const [newLifeEventText, setNewLifeEventText] = useState('')
  const [currentText, setCurrentText] = useState(serverText)

  // Initialize mood contacts from server data
  useEffect(() => {
    setMoodContacts(serverMoodContacts || [])
  }, [serverMoodContacts])

  // Initialize mood things from server data
  useEffect(() => {
    setMoodThings(serverMoodThings || [])
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

    useEffect(() => {
    setCurrentText(serverText)
  }, [serverText])



  // Fetch contacts
  const { data: contactsData, mutate: mutateContacts, isLoading: contactsLoading } = useSWR(
    session?.user ? `/api/v1/contacts` : null,
    async () => {
      const response = await fetch('/api/v1/contacts')
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
    session?.user ? `/api/v1/life-events` : null,
    async () => {
      const response = await fetch('/api/v1/life-events')
      if (response.ok) {
        const data = await response.json()
        setLifeEvents(data.lifeEvents || [])
        return data
      }
      return { lifeEvents: [] }
    }
  )

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

  // Create debounced version of handleSubmit for sliders
  const debouncedHandleSubmit = useDebounce(async (value, field) => {
    const updatedMood = {...mood, [field]: value}
    setMood(updatedMood)
    // Always include current mood contacts, things, life events and updated mood state when saving any mood data
    await handleMoodSubmit(value, field, fullDay, moodContacts, moodThings, undefined, updatedMood, moodLifeEvents)
    // Don't call updateUser immediately to avoid clearing mood contacts/things/life events
    // The session will be updated naturally when the user navigates or refreshes
  }, 3000)

  // Create debounced version that preserves text when updating mood sliders
  const debouncedHandleSubmitWithText = useDebounce(async (value, field) => {
    const updatedMood = {...mood, [field]: value}
    setMood(updatedMood)
    // Include current text value, mood contacts, things, life events and updated mood state when saving mood data
    await handleMoodSubmit(value, field, fullDay, moodContacts, moodThings, currentText, updatedMood, moodLifeEvents)
    // Don't call updateUser immediately to avoid clearing mood contacts/things/life events
    // The session will be updated naturally when the user navigates or refreshes
  }, 3000)

  // Create debounced version of handleSubmit for text input
  const debouncedHandleTextSubmit = useDebounce(async (value, field) => {
    await handleMoodSubmit(value, field, fullDay, moodContacts, moodThings, undefined, mood, moodLifeEvents)
    // Don't call updateUser immediately to avoid clearing mood contacts/things/life events
    // The session will be updated naturally when the user navigates or refreshes
  }, 3000)

  const handleSubmit = async (value, field) => {
    const updatedMood = {...mood, [field]: value}
    setMood(updatedMood)
    // Always include current mood contacts, things, life events and updated mood state when saving any mood data
    await handleMoodSubmit(value, field, fullDay, moodContacts, moodThings, undefined, updatedMood, moodLifeEvents)
    // Don't call updateUser immediately to avoid clearing mood contacts/things/life events
    // The session will be updated naturally when the user navigates or refreshes
  }

  // Create debounced version of handleMoodContactsChange for contact interaction sliders
  const debouncedHandleMoodContactsChange = useDebounce(async (newMoodContacts) => {
    setMoodContacts(newMoodContacts)
    // Save mood contacts to database immediately when they change
    await handleMoodSubmit(null, 'contacts', fullDay, newMoodContacts, moodThings, undefined, mood, moodLifeEvents)
    // Don't call updateUser immediately to avoid race conditions
    // The session will be updated naturally when the user navigates or refreshes
  }, 500)

  const handleMoodContactsChange = async (newMoodContacts) => {
    setMoodContacts(newMoodContacts)
    // Save mood contacts to database immediately when they change
    await handleMoodSubmit(null, 'contacts', fullDay, newMoodContacts, moodThings, undefined, mood, moodLifeEvents)
    // Don't call updateUser immediately to avoid race conditions
    // The session will be updated naturally when the user navigates or refreshes
  }

  // Create debounced version of handleMoodThingsChange for thing interaction sliders
  const debouncedHandleMoodThingsChange = useDebounce(async (newMoodThings) => {
    setMoodThings(newMoodThings)
    // Save mood things to database immediately when they change
    await handleMoodSubmit(null, 'things', fullDay, moodContacts, newMoodThings, undefined, mood, moodLifeEvents)
    // Don't call updateUser immediately to avoid race conditions
    // The session will be updated naturally when the user navigates or refreshes
  }, 500)

  const handleMoodThingsChange = async (newMoodThings) => {
    setMoodThings(newMoodThings)
    // Save mood things to database immediately when they change
    await handleMoodSubmit(null, 'things', fullDay, moodContacts, newMoodThings, undefined, mood, moodLifeEvents)
    // Don't call updateUser immediately to avoid race conditions
    // The session will be updated naturally when the user navigates or refreshes
  }

  // Create debounced version of handleMoodLifeEventsChange for life event interaction sliders
  const debouncedHandleMoodLifeEventsChange = useDebounce(async (newMoodLifeEvents) => {
    setMoodLifeEvents(newMoodLifeEvents)
    // Save mood life events to database immediately when they change
    await handleMoodSubmit(null, 'lifeEvents', fullDay, moodContacts, moodThings, undefined, mood, newMoodLifeEvents)
    // Don't call updateUser immediately to avoid race conditions
    // The session will be updated naturally when the user navigates or refreshes
  }, 500)

  const handleMoodLifeEventsChange = async (newMoodLifeEvents) => {
    setMoodLifeEvents(newMoodLifeEvents)
    // Save mood life events to database immediately when they change
    await handleMoodSubmit(null, 'lifeEvents', fullDay, moodContacts, moodThings, undefined, mood, newMoodLifeEvents)
    // Don't call updateUser immediately to avoid race conditions
    // The session will be updated naturally when the user navigates or refreshes
  }

  const handleAddLifeEvent = async () => {
    if (!newLifeEventText.trim()) return

    try {
      const response = await fetch('/api/v1/life-events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: newLifeEventText.trim(),
          impact: 3 // Default impact rating
        }),
      })

      if (response.ok) {
        const result = await response.json()
        const lifeEvent = result.lifeEvent

        // Add to selected life events immediately
        const lifeEventRef = {
          id: lifeEvent.id,
          name: lifeEvent.name,
          impact: 3
        }
        setMoodLifeEvents([...moodLifeEvents, lifeEventRef])

        // Clear the textarea
        setNewLifeEventText('')

        // Refresh the life events list
        mutateLifeEvents()

        // Save to mood data
        await handleMoodSubmit(null, 'lifeEvents', fullDay, moodContacts, moodThings, undefined, mood, [...moodLifeEvents, lifeEventRef])
      }
    } catch (error) {
      console.error('Error adding life event:', error)
    }
  }



  const handleEditDay = (date) => {
    setFullDay(date)
  }

  const handleCloseDates = async (values) => {
    await handleCloseDatesUtil(values, undefined, fullDay)
    await updateUser(session, setGlobalContext, { session, theme })
  }

 
  useEffect(() => {
    updateUser(session, setGlobalContext, { session, theme })
    generateInsight(setInsight, 'test', locale)
  }, [locale])

  // Use enhanced loading state to prevent flashing (moodView doesn't use SWR)
  const isDataLoading = useEnhancedLoadingState(false, session)

  if (isDataLoading) {
    return <MoodViewSkeleton />
  }

  return (
    <ContentLoadingWrapper>
      <div key={JSON.stringify(serverMood)} className="w-full m-auto p-4">
        <Textarea 
          className="mb-16" 
          value={currentText} 
          onChange={(e) => {
            setCurrentText(e.target.value)
          }}
          onBlur={() => {
            debouncedHandleTextSubmit(currentText, "text")
          }}
        />
      <div className="my-12">
        <h3 className="mt-8 mb-4">{t('charts.gratitude')}</h3>
        <small>{insight?.gratitudeAnalysis}</small>
      </div>
      <Slider className="mb-24" defaultValue={[serverMood.gratitude || 0]} max={5} step={0.5} onValueChange={(e) => debouncedHandleSubmitWithText(e[0], "gratitude")} />
      <div className="my-12">
        <h3 className="mt-8 mb-4">{t('charts.optimism')}</h3>
        <small>{insight?.optimismAnalysis}</small>
      </div>
      <Slider className="mb-24" defaultValue={[serverMood.optimism || 0]} max={5} step={0.5} onValueChange={(e) => debouncedHandleSubmitWithText(e[0], "optimism")} />
      <div className="my-12">
        <h3 className="mt-8 mb-4">{t('charts.restedness')}</h3>
        <small>{insight?.restednessAnalysis}</small>
      </div>
      <Slider className="mb-24" defaultValue={[serverMood.restedness || 0]} max={5} step={0.5} onValueChange={(e) => debouncedHandleSubmitWithText(e[0], "restedness")} />
      <div className="my-12">
        <h3 className="mt-8 mb-4">{t('charts.tolerance')}</h3>
        <small>{insight?.toleranceAnalysis}</small>
      </div>
      <Slider className="mb-24" defaultValue={[serverMood.tolerance || 0]} max={5} step={0.5} onValueChange={(e) => debouncedHandleSubmitWithText(e[0], "tolerance")} />
      <div className="my-12">
        <h3 className="mb-4">{t('charts.selfEsteem')}</h3>
        <small>{insight?.selfEsteemAnalysis}</small>
      </div>
      <Slider className="mb-24" defaultValue={[serverMood.selfEsteem || 0]} max={5} step={0.5} onValueChange={(e) => debouncedHandleSubmitWithText(e[0], "selfEsteem")} />
      <div className="my-12">
        <h3 className="mt-8 mb-4">{t('charts.trust')}</h3>
        <small>{insight?.trustAnalysis}</small>
      </div>
      <Slider className="mb-24" defaultValue={[serverMood?.trust || 0]} max={5} step={0.5} onValueChange={(e) => debouncedHandleSubmitWithText(e[0], "trust")} />
      </div>

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
                  <span className="text-xs text-muted-foreground">{lifeEvent.impact || 3}/5</span>
                </div>
                <Slider
                  value={[lifeEvent.impact || 3]}
                  onValueChange={(value) => {
                    const updatedLifeEvents = moodLifeEvents.map(le => 
                      le.id === lifeEvent.id 
                        ? { ...le, impact: value[0] }
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
        {moodContacts.length > 0 && (
          <div className="mt-6 space-y-4">
            <h4 className="text-sm font-medium text-muted-foreground">{t('social.interactionQualityRatings')}</h4>
            {moodContacts.map((contact) => (
              <div key={contact.id} className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{contact.name}</span>
                  <span className="text-xs text-muted-foreground">{contact.interactionQuality || 3}/5</span>
                </div>
                <Slider
                  value={[contact.interactionQuality || 3]}
                  onValueChange={(value) => {
                    const updatedContacts = moodContacts.map(c => 
                      c.id === contact.id 
                        ? { ...c, interactionQuality: value[0] }
                        : c
                    )
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
        {moodThings.length > 0 && (
          <div className="mt-6 space-y-4">
            <h4 className="text-sm font-medium text-muted-foreground">{t('social.thingsInteractionQualityRatings')}</h4>
            {moodThings.map((thing) => (
              <div key={thing.id} className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{thing.name}</span>
                  <span className="text-xs text-muted-foreground">{thing.interactionQuality || 3}/5</span>
                </div>
                <Slider
                  value={[thing.interactionQuality || 3]}
                  onValueChange={(value) => {
                    const updatedThings = moodThings.map(t => 
                      t.id === thing.id 
                        ? { ...t, interactionQuality: value[0] }
                        : t
                    )
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
    </ContentLoadingWrapper>
  )
}