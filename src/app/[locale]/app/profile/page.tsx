'use client'

import React, { useState, useEffect, useContext } from 'react'
import { useAuth } from '@clerk/nextjs'
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
import { PublicChartsView } from "@/components/PublicChartsView"

export default function ProfilePage({ params }: { params: Promise<{ locale: string }> }) {
  const { isLoaded, isSignedIn } = useAuth()
  const { t } = useI18n()
  const { session, setGlobalContext, theme } = useContext(GlobalContext)
  
  const [profile, setProfile] = useState({
    firstName: '',
    lastName: '',
    userName: '',
    bio: '',
    profilePicture: '',
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

  // Load profile data
  useEffect(() => {
    if (isLoaded && isSignedIn) {
      loadProfile()
    }
  }, [isLoaded, isSignedIn])

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
            profilePicture: data.profile.profilePicture || '',
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
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 rounded w-1/4"></div>
            <div className="h-32 bg-gray-200 rounded"></div>
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
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">{t('profile.editProfile')}</h1>
          {profile.userName && (
            <a 
              href={`/profile/${profile.userName}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              {t('profile.viewPublicProfile')} →
            </a>
          )}
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Profile Information */}
          <Card>
            <CardHeader>
              <CardTitle>{t('profile.profileInformation')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="firstName">{t('profile.firstName')}</Label>
                  <Input
                    id="firstName"
                    value={profile.firstName}
                    onChange={(e) => handleProfileChange('firstName', e.target.value)}
                    placeholder={t('profile.firstNamePlaceholder')}
                  />
                  <div className="flex items-center space-x-2 mt-2">
                    <Switch
                      id="firstName-visible"
                      checked={profile.firstNameVisible}
                      onCheckedChange={(checked) => handleProfileChange('firstNameVisible', checked)}
                    />
                    <Label htmlFor="firstName-visible">{t('profile.makePublic')}</Label>
                  </div>
                </div>
                
                <div>
                  <Label htmlFor="lastName">{t('profile.lastName')}</Label>
                  <Input
                    id="lastName"
                    value={profile.lastName}
                    onChange={(e) => handleProfileChange('lastName', e.target.value)}
                    placeholder={t('profile.lastNamePlaceholder')}
                  />
                  <div className="flex items-center space-x-2 mt-2">
                    <Switch
                      id="lastName-visible"
                      checked={profile.lastNameVisible}
                      onCheckedChange={(checked) => handleProfileChange('lastNameVisible', checked)}
                    />
                    <Label htmlFor="lastName-visible">{t('profile.makePublic')}</Label>
                  </div>
                </div>
              </div>
              
              <div>
                <Label htmlFor="userName">{t('profile.userName')}</Label>
                <Input
                  id="userName"
                  value={profile.userName}
                  onChange={(e) => handleProfileChange('userName', e.target.value)}
                  placeholder={t('profile.userNamePlaceholder')}
                />
                <div className="flex items-center space-x-2 mt-2">
                  <Switch
                    id="userName-visible"
                    checked={profile.userNameVisible}
                    onCheckedChange={(checked) => handleProfileChange('userNameVisible', checked)}
                  />
                  <Label htmlFor="userName-visible">{t('profile.makePublic')}</Label>
                </div>
              </div>
              
              <div>
                <Label htmlFor="bio">{t('profile.bio')}</Label>
                <Textarea
                  id="bio"
                  value={profile.bio}
                  onChange={(e) => handleProfileChange('bio', e.target.value)}
                  placeholder={t('profile.bioPlaceholder')}
                  rows={3}
                />
                <div className="flex items-center space-x-2 mt-2">
                  <Switch
                    id="bio-visible"
                    checked={profile.bioVisible}
                    onCheckedChange={(checked) => handleProfileChange('bioVisible', checked)}
                  />
                  <Label htmlFor="bio-visible">{t('profile.makePublic')}</Label>
                </div>
              </div>
              
              <div>
                <Label htmlFor="profilePicture">{t('profile.profilePicture')}</Label>
                <Input
                  id="profilePicture"
                  value={profile.profilePicture}
                  onChange={(e) => handleProfileChange('profilePicture', e.target.value)}
                  placeholder={t('profile.profilePicturePlaceholder')}
                />
                <div className="flex items-center space-x-2 mt-2">
                  <Switch
                    id="profilePicture-visible"
                    checked={profile.profilePictureVisible}
                    onCheckedChange={(checked) => handleProfileChange('profilePictureVisible', checked)}
                  />
                  <Label htmlFor="profilePicture-visible">{t('profile.makePublic')}</Label>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Charts Visibility */}
          <Card>
            <CardHeader>
              <CardTitle>{t('profile.chartsVisibility')}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {t('profile.chartsVisibilityDescription')}
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>{t('profile.moodCharts')}</Label>
                  <p className="text-sm text-muted-foreground">{t('profile.moodChartsDescription')}</p>
                </div>
                <Switch
                  checked={publicCharts.moodCharts || false}
                  onCheckedChange={(checked) => handleChartsVisibilityChange('moodCharts', checked)}
                />
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <Label>{t('profile.simplifiedMoodChart')}</Label>
                  <p className="text-sm text-muted-foreground">{t('profile.simplifiedMoodChartDescription')}</p>
                </div>
                <Switch
                  checked={publicCharts.simplifiedMoodChart || false}
                  onCheckedChange={(checked) => handleChartsVisibilityChange('simplifiedMoodChart', checked)}
                />
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <Label>{t('profile.productivityCharts')}</Label>
                  <p className="text-sm text-muted-foreground">{t('profile.productivityChartsDescription')}</p>
                </div>
                <Switch
                  checked={publicCharts.productivityCharts || false}
                  onCheckedChange={(checked) => handleChartsVisibilityChange('productivityCharts', checked)}
                />
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <Label>{t('profile.earningsCharts')}</Label>
                  <p className="text-sm text-muted-foreground">{t('profile.earningsChartsDescription')}</p>
                </div>
                <Switch
                  checked={publicCharts.earningsCharts || false}
                  onCheckedChange={(checked) => handleChartsVisibilityChange('earningsCharts', checked)}
                />
              </div>
              
              <Separator />
              
              <div className="flex items-center justify-between">
                <div>
                  <Label>{t('profile.makeAllChartsPublic')}</Label>
                  <p className="text-sm text-muted-foreground">{t('profile.makeAllChartsPublicDescription')}</p>
                </div>
                <Switch
                  checked={profile.publicChartsVisible}
                  onCheckedChange={(checked) => handleProfileChange('publicChartsVisible', checked)}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Preview Section */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>{t('profile.preview')}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {t('profile.previewDescription')}
            </p>
          </CardHeader>
          <CardContent>
            <div className="flex items-center space-x-4">
              {profile.profilePictureVisible && profile.profilePicture && (
                <img 
                  src={profile.profilePicture} 
                  alt="Profile" 
                  className="w-16 h-16 rounded-full object-cover"
                />
              )}
              <div>
                <h3 className="text-lg font-semibold">
                  {profile.firstNameVisible && profile.firstName} {profile.lastNameVisible && profile.lastName}
                </h3>
                {profile.userNameVisible && profile.userName && (
                  <p className="text-muted-foreground">@{profile.userName}</p>
                )}
                {profile.bioVisible && profile.bio && (
                  <p className="text-sm mt-1">{profile.bio}</p>
                )}
              </div>
            </div>
            
            {profile.publicChartsVisible && (
              <div className="mt-4">
                <h4 className="font-medium mb-2">{t('profile.publicCharts')}</h4>
                <div className="space-y-2 mb-4">
                  {publicCharts.moodCharts && <Badge variant="outline">{t('profile.moodCharts')}</Badge>}
                  {publicCharts.simplifiedMoodChart && <Badge variant="outline">{t('profile.simplifiedMoodChart')}</Badge>}
                  {publicCharts.productivityCharts && <Badge variant="outline">{t('profile.productivityCharts')}</Badge>}
                  {publicCharts.earningsCharts && <Badge variant="outline">{t('profile.earningsCharts')}</Badge>}
                </div>
                
                {/* Preview of actual charts */}
                <div className="mt-4">
                  <h5 className="text-sm font-medium mb-2">{t('profile.chartPreview')}</h5>
                  <div className="border rounded-md p-4 bg-muted/50">
                    <PublicChartsView chartsData={generateChartsData()} />
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {saving && (
          <div className="fixed bottom-4 right-4 bg-primary text-primary-foreground px-4 py-2 rounded-md">
            {t('profile.saving')}
          </div>
        )}
      </div>
    </main>
  )
}
