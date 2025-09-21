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
import { useDebounce } from "@/lib/hooks/useDebounce"

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
    console.log('serverMoodContacts calculation:', {
      year,
      date,
      dayEntry,
      contacts: dayEntry?.contacts,
      sessionEntries: session?.user?.entries?.[year]?.days?.[date]
    })
    return dayEntry?.contacts || []
  }, [session?.user?.entries, year, date, session?.user?.entries?.[year]?.days?.[date]?.contacts])

  const [insight, setInsight] = useState({})
  const [contacts, setContacts] = useState([])
  const [moodContacts, setMoodContacts] = useState([])
  const [currentText, setCurrentText] = useState(serverText)

  // Initialize mood contacts from server data
  useEffect(() => {
    console.log('Initializing mood contacts:', serverMoodContacts)
    setMoodContacts(serverMoodContacts || [])
  }, [serverMoodContacts])

  // Update currentText when serverText changes (when switching dates)
  useEffect(() => {
    setCurrentText(serverText)
  }, [serverText])

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

  // Ensure contacts are loaded from SWR data
  useEffect(() => {
    if (contactsData?.contacts) {
      setContacts(contactsData.contacts)
    }
  }, [contactsData])

  // Create debounced version of handleSubmit for sliders
  const debouncedHandleSubmit = useDebounce(async (value, field) => {
    setMood({...mood, [field]: value})
    // Always include current mood contacts when saving any mood data
    await handleMoodSubmit(value, field, fullDay, moodContacts)
    // Don't call updateUser immediately to avoid clearing mood contacts
    // The session will be updated naturally when the user navigates or refreshes
  }, 500)

  // Create debounced version that preserves text when updating mood sliders
  const debouncedHandleSubmitWithText = useDebounce(async (value, field) => {
    setMood({...mood, [field]: value})
    // Include current text value when saving mood data
    await handleMoodSubmit(value, field, fullDay, moodContacts, currentText)
    // Don't call updateUser immediately to avoid clearing mood contacts
    // The session will be updated naturally when the user navigates or refreshes
  }, 500)

  // Create debounced version of handleSubmit for text input
  const debouncedHandleTextSubmit = useDebounce(async (value, field) => {
    await handleMoodSubmit(value, field, fullDay, moodContacts)
    // Don't call updateUser immediately to avoid clearing mood contacts
    // The session will be updated naturally when the user navigates or refreshes
  }, 500)

  const handleSubmit = async (value, field) => {
    setMood({...mood, [field]: value})
    // Always include current mood contacts when saving any mood data
    await handleMoodSubmit(value, field, fullDay, moodContacts)
    // Don't call updateUser immediately to avoid clearing mood contacts
    // The session will be updated naturally when the user navigates or refreshes
  }

  // Create debounced version of handleMoodContactsChange for contact interaction sliders
  const debouncedHandleMoodContactsChange = useDebounce(async (newMoodContacts) => {
    setMoodContacts(newMoodContacts)
    // Save mood contacts to database immediately when they change
    await handleMoodSubmit(null, 'contacts', fullDay, newMoodContacts)
    // Don't call updateUser immediately to avoid race conditions
    // The session will be updated naturally when the user navigates or refreshes
  }, 500)

  const handleMoodContactsChange = async (newMoodContacts) => {
    setMoodContacts(newMoodContacts)
    // Save mood contacts to database immediately when they change
    await handleMoodSubmit(null, 'contacts', fullDay, newMoodContacts)
    // Don't call updateUser immediately to avoid race conditions
    // The session will be updated naturally when the user navigates or refreshes
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
      <h2 className="mt-8 mb-4 text-center text-lg">{t('mood.subtitle')}</h2>
      
      <Textarea 
        className="mb-16" 
        value={currentText} 
        onChange={(e) => {
          setCurrentText(e.target.value)
          debouncedHandleTextSubmit(e.target.value, "text")
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
            {/* Contact Management for Mood */}
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
    </ContentLoadingWrapper>
  )
}