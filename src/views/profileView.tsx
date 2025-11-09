'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { PublicChartsView } from "@/components/PublicChartsView"
import { AddFriendButtonOrSignIn } from "@/components/AddFriendButtonOrSignIn"
import { PublicNotesViewer } from "@/components/PublicNotesViewer"
import { PublicTemplatesViewer } from "@/components/PublicTemplatesViewer"

interface ProfileData {
  userId?: string
  firstName?: string
  lastName?: string
  userName?: string
  bio?: string
  profilePicture?: string
  publicCharts?: any
}

interface ProfileViewProps {
  profile: ProfileData
  userName: string
  locale: string
  currentUserUsername?: string | null
  isLoggedIn: boolean
  translations: any
}

export const ProfileView = ({ 
  profile: initialProfile, 
  userName, 
  locale, 
  currentUserUsername, 
  isLoggedIn, 
  translations 
}: ProfileViewProps) => {
  const [profile, setProfile] = useState<ProfileData>(initialProfile)
  const [loading, setLoading] = useState(false)

  // Requery profile endpoint on mount to get fields based on friendship status
  // This ensures we get the most up-to-date data based on the current user's authentication
  // and friendship status, even if the initial SSR data was fetched without auth context
  useEffect(() => {
    const fetchProfile = async () => {
      if (!userName) return
      
      setLoading(true)
      try {
        const response = await fetch(`/api/v1/profile/${userName}`, {
          cache: 'no-store',
          credentials: 'include' // Include cookies for authentication
        })
        
        if (response.ok) {
          const data = await response.json()
          if (data.profile) {
            setProfile(data.profile)
          }
        }
      } catch (error) {
        console.error('Error fetching profile:', error)
        // Keep the initial profile data on error
      } finally {
        setLoading(false)
      }
    }

    // Always fetch on mount to get fresh data based on current auth state
    fetchProfile()
  }, [userName])

  const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(' ')
  const hasAnyPublicData = profile.firstName || profile.lastName || profile.userName || profile.bio || profile.profilePicture
  const isOwnProfile = currentUserUsername === userName
  const canAddFriend = !isOwnProfile && profile.userName
  const canEditProfile = isOwnProfile

  // Display name logic: prefer fullName, then userName (even if not visible), then fallback
  const displayName = fullName || profile.userName || 'Anonymous User'

  return (
    <main className="p-2 flex bg-background overflow-x-hidden">
      <div className="max-w-4xl mx-auto p-4 w-full min-w-0">
        {/* Profile Header */}
        <Card className="mb-6">
          <CardContent>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                {profile.profilePicture && (
                  <img
                    src={profile.profilePicture}
                    alt="Profile"
                    className="w-20 h-20 rounded-full object-cover mx-auto sm:mx-0"
                  />
                )}
                <div className="flex-1 text-center sm:text-left min-w-0">
                  <h1 className="text-2xl font-bold break-words">
                    {displayName}
                  </h1>
                  {profile.userName && (
                    <p className="text-muted-foreground break-words">@{profile.userName}</p>
                  )}
                  {profile.bio && (
                    <p className="mt-2 text-sm break-words">{profile.bio}</p>
                  )}
                </div>
              </div>
              {(canAddFriend || canEditProfile) && profile.userName && (
                <div className="flex justify-center md:justify-end">
                  <AddFriendButtonOrSignIn 
                    targetUserName={profile.userName} 
                    isLoggedIn={isLoggedIn}
                    currentUserName={currentUserUsername || undefined}
                  />
                </div>
              )}
            </div>
          </CardContent>
        </Card>

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
              {profile.publicCharts ? (
                <div className="w-full min-w-0 overflow-x-auto">
                  <PublicChartsView chartsData={profile.publicCharts} />
                </div>
              ) : (
                <div className="text-center text-muted-foreground py-8">
                  <p>{(translations as any)?.publicProfile?.noAnalyticsData || 'No analytics data available yet.'}</p>
                </div>
              )}
            </TabsContent>
            
            <TabsContent value="notes" className="mt-4 min-w-0">
              <PublicNotesViewer userName={userName} showCard={false} />
            </TabsContent>
            
            <TabsContent value="templates" className="mt-4 min-w-0">
              <PublicTemplatesViewer userName={userName} showCard={false} isLoggedIn={isLoggedIn} />
            </TabsContent>
          </Tabs>
        </div>

        {/* No public data message */}
        {!hasAnyPublicData && !profile.publicCharts && (
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
