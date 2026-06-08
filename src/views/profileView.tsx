'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { Edit } from 'lucide-react'

import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { PublicChartsView } from "@/components/publicChartsView"
import { AddFriendButtonOrSignIn } from "@/components/addFriendButtonOrSignIn"
import { PublicNotesViewer } from "@/components/publicNotesViewer"
import { MeetMeRow } from "@/components/meetMeRow"
import ActivityCard, { ActivityItem } from "@/components/activityCard"

interface ProfileData {
  userId?: string
  firstName?: string
  lastName?: string
  userName?: string
  bio?: string
  profilePicture?: string
  publicCharts?: any
  templates?: any[]
  taskLists?: any[]
  meetMe?: {
    preferredTime?: string
    duration?: string
    availability?: string
    startDate?: string | null
    endDate?: string | null
  } | null
  data?: {
    firstName?: { value?: string; visibility?: boolean }
    lastName?: { value?: string; visibility?: boolean }
    username?: { value?: string; visibility?: boolean }
    bio?: { value?: string; visibility?: boolean }
    profilePicture?: { value?: string; visibility?: boolean }
    charts?: { value?: any; visibility?: boolean }
  }
}

interface ProfileViewProps {
  profile: ProfileData
  userName: string
  locale: string
  currentUserUsername?: string | null
  isLoggedIn: boolean
  translations: any
}

function getTimeAgo(date: Date): string {
  const now = new Date()
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)

  if (diffInSeconds < 60) return 'just now'

  const diffInMinutes = Math.floor(diffInSeconds / 60)
  if (diffInMinutes < 60) return `${diffInMinutes} minute${diffInMinutes === 1 ? '' : 's'} ago`

  const diffInHours = Math.floor(diffInMinutes / 60)
  if (diffInHours < 24) return `${diffInHours} hour${diffInHours === 1 ? '' : 's'} ago`

  const diffInDays = Math.floor(diffInHours / 24)
  if (diffInDays < 7) return `${diffInDays} day${diffInDays === 1 ? '' : 's'} ago`

  const diffInWeeks = Math.floor(diffInDays / 7)
  if (diffInWeeks < 4) return `${diffInWeeks} week${diffInWeeks === 1 ? '' : 's'} ago`

  const diffInMonths = Math.floor(diffInDays / 30)
  if (diffInMonths < 12) return `${diffInMonths} month${diffInMonths === 1 ? '' : 's'} ago`

  const diffInYears = Math.floor(diffInDays / 365)
  return `${diffInYears} year${diffInYears === 1 ? '' : 's'} ago`
}

export function ProfileView({
  profile,
  userName,
  locale,
  currentUserUsername,
  isLoggedIn,
  translations
}: ProfileViewProps): React.ReactElement {
  // Extract profile data - API returns flat structure, but also support nested structure as fallback
  const profileData = profile.data || {}
  const firstName = profile.firstName || profileData.firstName?.value
  const lastName = profile.lastName || profileData.lastName?.value
  const profileUserName = profile.userName || profileData.username?.value
  const bio = profile.bio || profileData.bio?.value
  const profilePicture = profile.profilePicture || profileData.profilePicture?.value
  const publicCharts = profile.publicCharts || profileData.charts?.value
  const meetMe = profile.meetMe

  const fullName = [firstName, lastName].filter(Boolean).join(' ')
  const hasAnyPublicData = firstName || lastName || profileUserName || bio || profilePicture
  const isOwnProfile = currentUserUsername === userName
  const showAddFriendButton = !isOwnProfile && profileUserName
  const showMobileEditProfileButton = isOwnProfile && profileUserName
  const displayName = fullName || profileUserName || 'Anonymous User'

  // Show MeetMe booking row when: not own profile, and meetMe is configured (logged in or not)
  const showMeetMe = !isOwnProfile && meetMe && meetMe.preferredTime

  // MeetMe state for the read-only booking row (settings come from profile owner)
  const [meetMePreferredTime, setMeetMePreferredTime] = useState(meetMe?.preferredTime || '')

  return (
    <main className="p-2 flex bg-background overflow-x-hidden">
      <div className="max-w-4xl mx-auto p-4 w-full min-w-0">
        {/* Profile Header */}
        <Card className="mb-6">
          <CardContent>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                {profilePicture && (
                  <img
                    src={profilePicture}
                    alt="Profile"
                    className="w-20 h-20 rounded-full object-cover mx-auto sm:mx-0"
                  />
                )}
                <div className="flex-1 text-center sm:text-left min-w-0">
                  <h1 className="text-2xl font-bold break-words">
                    {displayName}
                  </h1>
                  {profileUserName && (
                    <p className="text-muted-foreground break-words">@{profileUserName}</p>
                  )}
                  {bio && (
                    <p className="mt-2 text-sm break-words">{bio}</p>
                  )}
                </div>
              </div>
              {showAddFriendButton && profileUserName && (
                <div className="flex justify-center md:justify-end">
                  <AddFriendButtonOrSignIn 
                    targetUserName={profileUserName} 
                    isLoggedIn={isLoggedIn}
                    currentUserName={currentUserUsername || undefined}
                  />
                </div>
              )}
              {showMobileEditProfileButton && (
                <div className="flex justify-center">
                  <Link href={`/${locale}/app/profile/edit`}>
                    <Button>
                      <Edit className="w-4 h-4 mr-2" />
                      {(translations as any)?.profile?.editProfile || 'Edit Profile'}
                    </Button>
                  </Link>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Meet Me booking row */}
        {showMeetMe && (
          <div className="mb-6">
            <MeetMeRow
              preferredTime={meetMePreferredTime}
              duration={meetMe?.duration || '30'}
              availability={meetMe?.availability || ''}
              startDate={meetMe?.startDate ? new Date(meetMe.startDate) : undefined}
              endDate={meetMe?.endDate ? new Date(meetMe.endDate) : undefined}
              onPreferredTimeChange={setMeetMePreferredTime}
              onDurationChange={() => {}}
              onAvailabilityChange={() => {}}
              onDateRangeChange={() => {}}
              bookingTargetUsername={userName}
              isLoggedIn={isLoggedIn}
            />
          </div>
        )}

        {/* Tabbed Content Section */}
        <div className="mb-6 w-full min-w-0">
          <Tabs defaultValue="notes" className="w-full">
            <div className="overflow-x-auto mb-4 -mx-1 px-1">
              <TabsList className="inline-flex w-full min-w-max">
                <TabsTrigger 
                  value="analytics"
                  className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground whitespace-nowrap flex-shrink-0"
                >
                  {(translations as any)?.publicProfile?.analytics || 'Analytics'}
                </TabsTrigger>
                <TabsTrigger 
                  value="notes"
                  className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground whitespace-nowrap flex-shrink-0"
                >
                  {(translations as any)?.publicProfile?.notes || 'Notes'}
                </TabsTrigger>
                <TabsTrigger 
                  value="templates"
                  className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground whitespace-nowrap flex-shrink-0"
                >
                  {(translations as any)?.publicProfile?.templates || 'Templates & Lists'}
                </TabsTrigger>
              </TabsList>
            </div>
            
            <TabsContent value="analytics" className="mt-4 min-w-0">
              {publicCharts ? (
                <div className="w-full min-w-0 overflow-x-auto">
                  <PublicChartsView chartsData={publicCharts} />
                </div>
              ) : (
                <div className="text-center text-muted-foreground py-8">
                  <p>{(translations as any)?.publicProfile?.noAnalyticsData || 'No analytics data available yet.'}</p>
                </div>
              )}
            </TabsContent>
            
            <TabsContent value="notes" className="mt-4 min-w-0">
              <PublicNotesViewer userName={userName} showCard={false} gridLayout={true} isOwnProfileHint={isOwnProfile} />
            </TabsContent>
            
            <TabsContent value="templates" className="mt-4 min-w-0">
              {(profile.templates && profile.templates.length > 0) || (profile.taskLists && profile.taskLists.length > 0) ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {profile.templates?.map((template) => {
                    const activityItem: ActivityItem = {
                      id: template.id,
                      type: 'template',
                      createdAt: template.createdAt,
                      name: template.name,
                      role: template.role,
                      visibility: template.visibility,
                      isLiked: template.isLiked,
                      comments: template.comments,
                      _count: template._count
                    }
                    return (
                      <ActivityCard
                        key={template.id}
                        item={activityItem}
                        getTimeAgo={getTimeAgo}
                        isLoggedIn={isLoggedIn}
                      />
                    )
                  })}
                  {profile.taskLists?.map((taskList) => {
                    const activityItem: ActivityItem = {
                      id: taskList.id,
                      type: 'tasklist',
                      createdAt: taskList.createdAt,
                      name: taskList.name,
                      role: taskList.role,
                      visibility: taskList.visibility,
                      budget: taskList.budget,
                      dueDate: taskList.dueDate,
                      isLiked: taskList.isLiked,
                      comments: taskList.comments,
                      _count: taskList._count
                    }
                    return (
                      <ActivityCard
                        key={taskList.id}
                        item={activityItem}
                        getTimeAgo={getTimeAgo}
                        isLoggedIn={isLoggedIn}
                      />
                    )
                  })}
                </div>
              ) : (
                <div className="text-center text-muted-foreground py-8">
                  <p>{(translations as any)?.publicProfile?.noPublicTemplatesOrLists || 'No public templates or lists available yet.'}</p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>

        {/* No public data message */}
        {!hasAnyPublicData && !publicCharts && (
          <Card>
            <CardContent className="pt-6">
              <div className="text-center text-muted-foreground">
                <p>{(translations as any)?.publicProfile?.profileNotPublic || 'This user hasn\'t made their profile public yet.'}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {!isLoggedIn && (
          <Card className="mt-6">
            <CardContent className="pt-6">
              <div className="text-center">
                <h2 className="text-xl font-semibold mb-2">{(translations as any)?.publicProfile?.ctaTitle || 'Start Your Own Dupip Journey'}</h2>
                <p className="text-muted-foreground mb-4">
                  {(translations as any)?.publicProfile?.ctaSubtitle || 'Track your mood, productivity, and earnings with Dupip'}
                </p>
                <a 
                  href={`/${locale}/app/dashboard`} 
                  className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
                >
                  {(translations as any)?.publicProfile?.getStarted || 'Get Started'}
                </a>
              </div>
            </CardContent>
          </Card>
        )}

      </div>
    </main>
  )
}
