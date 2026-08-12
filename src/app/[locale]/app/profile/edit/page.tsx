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
import { VisibilitySelect, VisibilityOption } from "@/components/visibilitySelect"
import { ViewMenu } from "@/components/viewMenu"
import { DashboardView } from "@/views/dashboard/dashboardView"
import { useDebounce } from "@/lib/hooks/useDebounce"
import { generatePublicChartsData, DEFAULT_LINK_VISIBILITY } from "@/lib/utils/profileUtils"
import type { ProfileLink } from "@/lib/utils/profileUtils"
import { PublicChartsView } from "@/components/publicChartsView"
import { Skeleton } from "@/components/ui/skeleton"
import { MeetMeRow } from "@/components/meetMeRow"
import { Plus, Trash2 } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export default function ProfilePage({ params }: { params: Promise<{ locale: string }> }) {
  const { isLoaded, isSignedIn } = useAuth()
  const { user: clerkUser } = useUser()
  const { t } = useI18n()
  const { session, setGlobalContext, theme } = useContext(GlobalContext)

  const SOCIAL_PLATFORMS = [
    { value: 'instagram', label: 'Instagram' },
    { value: 'facebook', label: 'Facebook' },
    { value: 'twitter', label: 'X (Twitter)' },
    { value: 'tiktok', label: 'TikTok' },
    { value: 'linkedin', label: 'LinkedIn' },
    { value: 'youtube', label: 'YouTube' },
    { value: 'discord', label: 'Discord' },
    { value: 'telegram', label: 'Telegram' },
    { value: 'custom', label: t('profile.links.customLink') },
  ]
  
  const [profile, setProfile] = useState({
    firstName: '',
    lastName: '',
    userName: '',
    bio: '',
    firstNameVisibility: 'PRIVATE' as VisibilityOption,
    lastNameVisibility: 'PRIVATE' as VisibilityOption,
    userNameVisibility: 'PRIVATE' as VisibilityOption,
    bioVisibility: 'PRIVATE' as VisibilityOption,
    profilePictureVisibility: 'PRIVATE' as VisibilityOption,
    publicChartsVisibility: 'PRIVATE' as VisibilityOption,
    linksVisibility: 'PRIVATE' as VisibilityOption,
  })

  const [links, setLinks] = useState<ProfileLink[]>([])

  // Get visibility value for a field
  const getFieldVisibility = (fieldName: string): VisibilityOption => {
    return profile[`${fieldName}Visibility` as keyof typeof profile] as VisibilityOption || 'PRIVATE'
  }

  // Handle visibility change for a field
  const handleVisibilityChange = (fieldName: string, visibility: VisibilityOption) => {
    handleProfileChange(`${fieldName}Visibility`, visibility)
  }
  
  const [publicCharts, setPublicCharts] = useState<{
    moodCharts?: boolean
    simplifiedMoodChart?: boolean
    productivityCharts?: boolean
    earningsCharts?: boolean
  }>({})
  const [meetMe, setMeetMe] = useState({
    preferredTime: '',
    duration: '',
    availability: '',
    startDate: undefined as Date | undefined,
    endDate: undefined as Date | undefined,
  })
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
          // Extract data from new profile.data structure
          const profileData = data.profile.data || {}
          
          // Helper to convert visibility boolean to VisibilityOption
          const getVisibility = (visibility: boolean | undefined): VisibilityOption => {
            return visibility ? 'PUBLIC' : 'PRIVATE'
          }
          
          setProfile({
            firstName: profileData.firstName?.value || '',
            lastName: profileData.lastName?.value || '',
            userName: profileData.username?.value || '',
            bio: profileData.bio?.value || '',
            firstNameVisibility: getVisibility(profileData.firstName?.visibility),
            lastNameVisibility: getVisibility(profileData.lastName?.visibility),
            userNameVisibility: getVisibility(profileData.username?.visibility),
            bioVisibility: getVisibility(profileData.bio?.visibility),
            profilePictureVisibility: getVisibility(profileData.profilePicture?.visibility),
            publicChartsVisibility: getVisibility(profileData.charts?.visibility),
            linksVisibility: getVisibility(profileData.links?.visibility),
          })
          setPublicCharts(profileData.charts?.value || {})
          setLinks(Array.isArray(profileData.links?.value) ? profileData.links.value : [])
          
          // Load meetMe settings
          if (profileData.meetMe) {
            setMeetMe({
              preferredTime: profileData.meetMe.preferredTime || '',
              duration: profileData.meetMe.duration || '',
              availability: profileData.meetMe.availability || '',
              startDate: profileData.meetMe.startDate ? new Date(profileData.meetMe.startDate) : undefined,
              endDate: profileData.meetMe.endDate ? new Date(profileData.meetMe.endDate) : undefined,
            })
          }
        }
      }
    } catch (error) {
      console.error('Error loading profile:', error)
    } finally {
      setLoading(false)
    }
  }

  // Create debounced save function
  const debouncedSave = useDebounce(async (profileData: Record<string, any>, chartsData: Record<string, any>, linksData: ProfileLink[], meetMeData?: { preferredTime: string; duration: string; availability: string; startDate?: Date; endDate?: Date }) => {
    setSaving(true)
    try {
      const response = await fetch('/api/v1/profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...profileData,
          publicCharts: chartsData,
          links: linksData,
          ...(meetMeData ? { meetMe: {
            preferredTime: meetMeData.preferredTime,
            duration: meetMeData.duration,
            availability: meetMeData.availability,
            startDate: meetMeData.startDate?.toISOString() || null,
            endDate: meetMeData.endDate?.toISOString() || null,
          } } : {})
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
    debouncedSave(newProfile, publicCharts, links)
  }

  const handleChartsVisibilityChange = (chartType: string, visible: boolean) => {
    const newPublicCharts = { ...publicCharts, [chartType]: visible }
    setPublicCharts(newPublicCharts)
    debouncedSave(profile, newPublicCharts, links)
  }

  const handleMeetMeChange = (field: string, value: any) => {
    const newMeetMe = { ...meetMe, [field]: value }
    setMeetMe(newMeetMe)
    debouncedSave(profile, publicCharts, links, newMeetMe)
  }

  const handleLinksChange = (newLinks: ProfileLink[]) => {
    setLinks(newLinks)
    // Filter out links with empty URLs before saving
    const linksToSave = newLinks.filter(l => l.url.trim() !== '')
    debouncedSave(profile, publicCharts, linksToSave)
  }

  const addLink = () => {
    const newLinks: ProfileLink[] = [...links, { type: 'custom', url: '', label: '', visibility: DEFAULT_LINK_VISIBILITY }]
    setLinks(newLinks)
    // Don't save yet — the new entry is empty
  }

  const removeLink = (index: number) => {
    handleLinksChange(links.filter((_, i) => i !== index))
  }

  const updateLink = (index: number, field: string, value: string) => {
    const newLinks = links.map((link, i) => i === index ? { ...link, [field]: value } : link) as ProfileLink[]
    handleLinksChange(newLinks)
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
          <div className="space-y-4">
            <Skeleton className="h-8 w-1/4" />
            <Skeleton className="h-32 w-full" />
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
              <div className="flex gap-2">
                <div className="flex-[2]">
                  <Label htmlFor="firstName">{t('profile.firstName')}</Label>
                  <Input
                    id="firstName"
                    value={profile.firstName}
                    onChange={(e) => handleProfileChange('firstName', e.target.value)}
                    placeholder={t('profile.firstNamePlaceholder')}
                  />
                </div>
                <div className="flex-[1] flex items-end">
                  <VisibilitySelect
                    value={getFieldVisibility('firstName')}
                    onValueChange={(value) => handleVisibilityChange('firstName', value)}
                    iconOnly={true}
                    className="w-full min-h-[40px] justify-center"
                  />
                </div>
              </div>
              
              <div className="flex gap-2">
                <div className="flex-[2]">
                  <Label htmlFor="lastName">{t('profile.lastName')}</Label>
                  <Input
                    id="lastName"
                    value={profile.lastName}
                    onChange={(e) => handleProfileChange('lastName', e.target.value)}
                    placeholder={t('profile.lastNamePlaceholder')}
                  />
                </div>
                <div className="flex-[1] flex items-end">
                  <VisibilitySelect
                    value={getFieldVisibility('lastName')}
                    onValueChange={(value) => handleVisibilityChange('lastName', value)}
                    iconOnly={true}
                    className="w-full min-h-[40px] justify-center"
                  />
                </div>
              </div>
              
              <div className="flex gap-2">
                <div className="flex-[2]">
                  <Label htmlFor="bio">{t('profile.bio')}</Label>
                  <Textarea
                    id="bio"
                    value={profile.bio}
                    onChange={(e) => handleProfileChange('bio', e.target.value)}
                    placeholder={t('profile.bioPlaceholder')}
                    rows={3}
                  />
                </div>
                <div className="flex-[1] flex items-end">
                  <VisibilitySelect
                    value={getFieldVisibility('bio')}
                    onValueChange={(value) => handleVisibilityChange('bio', value)}
                    iconOnly={true}
                    className="w-full min-h-[40px] justify-center"
                  />
                </div>
              </div>
              
              <Separator />
              
              <div className="flex gap-2 items-center">
                {clerkUser?.imageUrl && (
                  <img 
                    src={clerkUser.imageUrl} 
                    alt="Profile" 
                    className="w-16 h-16 rounded-full object-cover"
                  />
                )}
                <div className="flex-[2]"></div>
                <div className="flex-[1] flex items-end">
                  <VisibilitySelect
                    value={getFieldVisibility('profilePicture')}
                    onValueChange={(value) => handleVisibilityChange('profilePicture', value)}
                    iconOnly={true}
                    className="w-full min-h-[40px] justify-center"
                  />
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
                <VisibilitySelect
                  value={getFieldVisibility('publicCharts')}
                  onValueChange={(value) => handleVisibilityChange('publicCharts', value)}
                  showIconOnMobile={false}
                  className="w-48"
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Social & Custom Links */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>{t('profile.links.title')}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {t('profile.links.description')}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>{t('profile.links.visibility')}</Label>
              <VisibilitySelect
                value={getFieldVisibility('links')}
                onValueChange={(value) => handleVisibilityChange('links', value)}
                showIconOnMobile={false}
                className="w-48"
              />
            </div>

            <Separator />

            {links.map((link, index) => (
              <div key={index} className="flex gap-2 items-start">
                <div className="flex flex-col gap-2 flex-1">
                  <Select
                    value={link.type}
                    onValueChange={(value) => updateLink(index, 'type', value)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SOCIAL_PLATFORMS.map((p) => (
                        <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {link.type === 'custom' && (
                    <Input
                      placeholder={t('profile.links.labelPlaceholder')}
                      value={link.label || ''}
                      onChange={(e) => updateLink(index, 'label', e.target.value)}
                    />
                  )}
                  <Input
                    placeholder={t('profile.links.urlPlaceholder')}
                    value={link.url}
                    onChange={(e) => updateLink(index, 'url', e.target.value)}
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeLink(index)}
                  className="mt-1 shrink-0"
                  aria-label="Remove link"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
                <VisibilitySelect
                  value={(link.visibility as VisibilityOption) || DEFAULT_LINK_VISIBILITY}
                  onValueChange={(value) => updateLink(index, 'visibility', value)}
                  iconOnly
                  className="mt-1 shrink-0 w-10 h-10"
                  availableOptions={['PRIVATE', 'FRIENDS', 'CLOSE_FRIENDS', 'PUBLIC']}
                />
              </div>
            ))}

            <Button variant="outline" onClick={addLink} className="w-full">
              <Plus className="w-4 h-4 mr-2" />
              {t('profile.links.addLink')}
            </Button>
          </CardContent>
        </Card>

        {/* Meet Me */}
        <Card className="mt-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t('profile.meetMe.title')}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {t('profile.meetMe.description')}
            </p>
          </CardHeader>
          <CardContent>
            <MeetMeRow
              preferredTime={meetMe.preferredTime}
              duration={meetMe.duration}
              availability={meetMe.availability}
              startDate={meetMe.startDate}
              endDate={meetMe.endDate}
              onPreferredTimeChange={(value) => handleMeetMeChange('preferredTime', value)}
              onDurationChange={(value) => handleMeetMeChange('duration', value)}
              onAvailabilityChange={(value) => handleMeetMeChange('availability', value)}
              onDateRangeChange={(start, end) => {
                const newMeetMe = { ...meetMe, startDate: start, endDate: end }
                setMeetMe(newMeetMe)
                debouncedSave(profile, publicCharts, links, newMeetMe)
              }}
            />
          </CardContent>
        </Card>

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
              {getFieldVisibility('profilePicture') !== 'PRIVATE' && clerkUser?.imageUrl && (
                <img 
                  src={clerkUser.imageUrl} 
                  alt="Profile" 
                  className="w-16 h-16 rounded-full object-cover"
                />
              )}
              <div>
                <h3 className="text-lg font-semibold">
                  {getFieldVisibility('firstName') !== 'PRIVATE' && profile.firstName} {getFieldVisibility('lastName') !== 'PRIVATE' && profile.lastName}
                </h3>
                {getFieldVisibility('bio') !== 'PRIVATE' && profile.bio && (
                  <p className="text-sm mt-1">{profile.bio}</p>
                )}
              </div>
            </div>
            
            {getFieldVisibility('publicCharts') !== 'PRIVATE' && (
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
