'use client'

import React, { useState, useEffect, useContext } from 'react'
import { useAuth, useUser } from '@clerk/nextjs'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { GlobalContext } from "@/lib/contexts"
import { useI18n } from "@/lib/contexts/i18n"
import { ViewMenu } from "@/components/viewMenu"
import { AnalyticsView } from "@/views/analyticsView"
import { useDebounce } from "@/lib/hooks/useDebounce"
import { generatePublicChartsData } from "@/lib/profileUtils"
import { PublicChartsView } from "@/components/publicChartsView"
import { Skeleton } from "@/components/ui/skeleton"
import { ProfileView } from "@/views/profileView"
import { loadTranslationsSync } from "@/lib/i18n"

export default function ProfilePage({ params }: { params: Promise<{ locale: string }> }) {
  const { isLoaded, isSignedIn } = useAuth()
  const { user: clerkUser } = useUser()
  const { t, locale } = useI18n()
  const { session, setGlobalContext, theme } = useContext(GlobalContext)
  
  const [profile, setProfile] = useState({
    firstName: '',
    lastName: '',
    userName: '',
    bio: '',
    firstNameVisible: false,
    lastNameVisible: false,
    userNameVisible: false,
    bioVisible: false,
    profilePictureVisible: false,
    publicChartsVisible: false,
  })
  
  const [publicCharts, setPublicCharts] = useState<{
    moodCharts?: boolean
    simplifiedMoodChart?: boolean
    productivityCharts?: boolean
    earningsCharts?: boolean
  }>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [publicProfileData, setPublicProfileData] = useState<any>(null)
  const [profileLoading, setProfileLoading] = useState(false)

  // Load profile data
  useEffect(() => {
    if (isLoaded && isSignedIn) {
      loadProfile()
    }
  }, [isLoaded, isSignedIn])

  // Load public profile data when profile is loaded
  useEffect(() => {
    if (profile.userName) {
      loadPublicProfile()
    }
  }, [profile.userName])

  const loadProfile = async () => {
    try {
      const response = await fetch('/api/v1/profile')
      if (response.ok) {
        const data = await response.json()
        if (data.profile) {
          setProfile({
            firstName: data.profile.firstName || '',
            lastName: data.profile.lastName || '',
            userName: data.profile.userName || '',
            bio: data.profile.bio || '',
            firstNameVisible: data.profile.firstNameVisible || false,
            lastNameVisible: data.profile.lastNameVisible || false,
            userNameVisible: data.profile.userNameVisible || false,
            bioVisible: data.profile.bioVisible || false,
            profilePictureVisible: data.profile.profilePictureVisible || false,
            publicChartsVisible: data.profile.publicChartsVisible || false,
          })
          setPublicCharts(data.profile.publicCharts || {})
        }
      }
    } catch (error) {
      console.error('Error loading profile:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadPublicProfile = async () => {
    if (!profile.userName) return
    
    setProfileLoading(true)
    try {
      const response = await fetch(`/api/v1/profile/${profile.userName}`)
      if (response.ok) {
        const data = await response.json()
        setPublicProfileData(data.profile)
      }
    } catch (error) {
      console.error('Error loading public profile:', error)
    } finally {
      setProfileLoading(false)
    }
  }

  // Create debounced save function
  const debouncedSave = useDebounce(async (profileData, chartsData) => {
    setSaving(true)
    try {
      const response = await fetch('/api/v1/profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...profileData,
          publicCharts: chartsData
        })
      })
      
      if (!response.ok) {
        throw new Error('Failed to save profile')
      }
    } catch (error) {
      console.error('Error saving profile:', error)
    } finally {
      setSaving(false)
    }
  }, 1000)

  const handleProfileChange = (field: string, value: any) => {
    const newProfile = { ...profile, [field]: value }
    setProfile(newProfile)
    debouncedSave(newProfile, publicCharts)
  }

  const handleChartsVisibilityChange = (chartType: string, visible: boolean) => {
    const newPublicCharts = { ...publicCharts, [chartType]: visible }
    setPublicCharts(newPublicCharts)
    debouncedSave(profile, newPublicCharts)
  }

  // Generate public charts data from user entries
  const generateChartsData = () => {
    if (!session?.user || !('entries' in session.user) || !session.user.entries) return {}
    
    const chartVisibility = {
      moodCharts: publicCharts.moodCharts || false,
      simplifiedMoodChart: publicCharts.simplifiedMoodChart || false,
      productivityCharts: publicCharts.productivityCharts || false,
      earningsCharts: publicCharts.earningsCharts || false,
    }
    
    return generatePublicChartsData(session.user.entries, chartVisibility)
  }

  if (loading) {
    return (
      <main className="">
        <ViewMenu active="profile" />
        <div className="max-w-4xl mx-auto p-4">
          <div className="space-y-6">
            {/* Profile Header Skeleton */}
            <div className="border rounded-lg p-6">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  <Skeleton className="w-20 h-20 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-6 w-48" />
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-4 w-64" />
                  </div>
                </div>
                <Skeleton className="h-10 w-32" />
              </div>
            </div>

            {/* Charts Section Skeleton */}
            <div className="border rounded-lg p-6">
              <div className="space-y-4">
                <Skeleton className="h-6 w-24" />
                <Skeleton className="h-64 w-full" />
              </div>
            </div>

            {/* Notes Section Skeleton */}
            <div className="border rounded-lg p-6">
              <div className="space-y-4">
                <Skeleton className="h-6 w-32" />
                <div className="space-y-3">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    )
  }

  if (!isSignedIn) {
    return (
      <main className="">
        <ViewMenu active="profile" />
        <div className="max-w-4xl mx-auto p-4">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-4">{t('profile.pleaseSignIn')}</h1>
            <Button><a href="/app/dashboard">{t('profile.goToDashboard')}</a></Button>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="">
      <ViewMenu active="profile" />
      <div className="max-w-4xl mx-auto p-4">

        {/* Public Profile View */}
        {profile.userName && (
          profileLoading ? (
            <div className="space-y-6">
              {/* Profile Header Skeleton */}
              <div className="border rounded-lg p-6">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                    <Skeleton className="w-20 h-20 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-6 w-48" />
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-4 w-64" />
                    </div>
                  </div>
                  <Skeleton className="h-10 w-32" />
                </div>
              </div>

              {/* Charts Section Skeleton */}
              <div className="border rounded-lg p-6">
                <div className="space-y-4">
                  <Skeleton className="h-6 w-24" />
                  <Skeleton className="h-64 w-full" />
                </div>
              </div>

              {/* Notes Section Skeleton */}
              <div className="border rounded-lg p-6">
                <div className="space-y-4">
                  <Skeleton className="h-6 w-32" />
                  <div className="space-y-3">
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                  </div>
                </div>
              </div>
            </div>
          ) : publicProfileData ? (
            <ProfileView
              profile={publicProfileData}
              userName={profile.userName}
              locale={locale}
              currentUserUsername={profile.userName}
              isLoggedIn={true}
              translations={loadTranslationsSync(locale)}
            />
          ) : null
        )}
      </div>
    </main>
  )
}
