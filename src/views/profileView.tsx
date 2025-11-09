'use client'

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
  profile, 
  userName, 
  locale, 
  currentUserUsername, 
  isLoggedIn, 
  translations 
}: ProfileViewProps) => {
  const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(' ')
  const hasAnyPublicData = profile.firstName || profile.lastName || profile.userName || profile.bio || profile.profilePicture
  const isOwnProfile = currentUserUsername === userName
  const canAddFriend = !isOwnProfile && profile.userName
  const canEditProfile = isOwnProfile

  // Display name logic: prefer fullName, then userName (even if not visible), then fallback
  const displayName = fullName || profile.userName || 'Anonymous User'

  return (
    <main className="p-2 flex bg-background">
      <div className="max-w-4xl mx-auto p-4">
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
                <div className="flex-1 text-center sm:text-left">
                  <h1 className="text-2xl font-bold">
                    {displayName}
                  </h1>
                  {profile.userName && (
                    <p className="text-muted-foreground">@{profile.userName}</p>
                  )}
                  {profile.bio && (
                    <p className="mt-2 text-sm">{profile.bio}</p>
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
          <Card className="mb-6">
          <CardContent className="pt-6">
            <Tabs defaultValue="notes" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger 
                  value="analytics"
                  className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  {(translations as any)?.publicProfile?.analytics || 'Analytics'}
                </TabsTrigger>
                <TabsTrigger 
                  value="notes"
                  className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  {(translations as any)?.publicProfile?.notes || 'Notes'}
                </TabsTrigger>
                <TabsTrigger 
                  value="templates"
                  className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  {(translations as any)?.publicProfile?.templates || 'Templates & Lists'}
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="analytics" className="mt-4">
                {profile.publicCharts ? (
              <PublicChartsView chartsData={profile.publicCharts} />
                ) : (
                  <div className="text-center text-muted-foreground py-8">
                    <p>{(translations as any)?.publicProfile?.noAnalyticsData || 'No analytics data available yet.'}</p>
                  </div>
                )}
              </TabsContent>
              
              <TabsContent value="notes" className="mt-4">
                <PublicNotesViewer userName={userName} showCard={false} />
              </TabsContent>
              
              <TabsContent value="templates" className="mt-4">
                <PublicTemplatesViewer userName={userName} showCard={false} isLoggedIn={isLoggedIn} />
              </TabsContent>
            </Tabs>
            </CardContent>
          </Card>

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
