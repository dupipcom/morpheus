import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PublicChartsView } from "@/components/PublicChartsView"
import { AddFriendButtonOrSignIn } from "@/components/AddFriendButtonOrSignIn"
import { auth } from '@clerk/nextjs/server'
import { I18nProvider } from '@/lib/contexts/i18n'
import { loadTranslations } from '@/lib/i18n'

interface ProfileData {
  userId?: string
  firstName?: string
  lastName?: string
  userName?: string
  bio?: string
  profilePicture?: string
  publicCharts?: any
}

async function getProfile(userName: string): Promise<ProfileData | null> {
  try {
    const response = await fetch(`${process.env.VERCEL_URL ? "https://" + process.env.VERCEL_URL : 'http://localhost:3000'}/api/v1/profile/${userName}`, {
      cache: 'no-store' // Ensure fresh data for SSR
    })
    
    if (!response.ok) {
      return null
    }
    
    const data = await response.json()
    return data.profile
  } catch (error) {
    console.error('Error fetching profile:', error)
    return null
  }
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string; userName: string }> }): Promise<Metadata> {
  const { userName } = await params
  
  const profile = await getProfile(userName)
  
  if (!profile) {
    return {
      title: 'Profile Not Found',
      description: 'The requested profile could not be found.'
    }
  }

  const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(' ')
  const title = profile.userName ? `@${profile.userName} · DreamPip` : 'DreamPip Profile'
  const description = profile.bio || `View ${fullName || profile.userName || 'this user'}'s profile on DreamPip`

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: profile.profilePicture ? [profile.profilePicture] : [],
      type: 'profile',
    },
    twitter: {
      card: 'summary',
      title,
      description,
      images: profile.profilePicture ? [profile.profilePicture] : [],
    },
  }
}

export default async function PublicProfilePage({ params }: { params: Promise<{ locale: string; userName: string }> }) {
  const { locale, userName } = await params
  const { userId } = await auth()
  const translations = await loadTranslations(locale as any)
  
  const profile = await getProfile(userName)
  
  if (!profile) {
    notFound()
  }

  const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(' ')
  const hasAnyPublicData = profile.firstName || profile.lastName || profile.userName || profile.bio || profile.profilePicture
  const canAddFriend = profile.userId && (userId !== profile.userId)
  const isLoggedIn = !!userId

  return (
    <I18nProvider locale={locale as any}>
    <main className="min-h-screen bg-background">
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
                    {fullName || profile.userName || 'Anonymous User'}
                  </h1>
                  {profile.userName && (
                    <p className="text-muted-foreground">@{profile.userName}</p>
                  )}
                  {profile.bio && (
                    <p className="mt-2 text-sm">{profile.bio}</p>
                  )}
                </div>
              </div>
              {canAddFriend && profile.userId && (
                <div className="flex justify-center md:justify-end">
                  <AddFriendButtonOrSignIn 
                    targetUserId={profile.userId} 
                    isLoggedIn={isLoggedIn}
                  />
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Public Charts */}
        {profile.publicCharts && (
          <Card>
            <CardHeader>
              <CardTitle>Analytics</CardTitle>
            </CardHeader>
            <CardContent>
              <PublicChartsView chartsData={profile.publicCharts} />
            </CardContent>
          </Card>
        )}

        {/* No public data message */}
        {!hasAnyPublicData && !profile.publicCharts && (
          <Card>
            <CardContent className="pt-6">
              <div className="text-center text-muted-foreground">
                <p>This user hasn't made their profile public yet.</p>
              </div>
            </CardContent>
          </Card>
        )}

        {!isLoggedIn && (
          <Card className="mt-6">
            <CardContent className="pt-6">
              <div className="text-center">
                <h2 className="text-xl font-semibold mb-2">{(translations as any)?.publicProfile?.ctaTitle || 'Start Your Own DreamPip Journey'}</h2>
                <p className="text-muted-foreground mb-4">
                  {(translations as any)?.publicProfile?.ctaSubtitle || 'Track your mood, productivity, and earnings with DreamPip'}
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
    </I18nProvider>
  )
}
