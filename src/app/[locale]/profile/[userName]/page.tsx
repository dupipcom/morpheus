import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PublicChartsView } from "@/components/PublicChartsView"
import { AddFriendButtonOrSignIn } from "@/components/AddFriendButtonOrSignIn"
import { auth } from '@clerk/nextjs/server'
import { I18nProvider } from '@/lib/contexts/i18n'
import { loadTranslations } from '@/lib/i18n'
import prisma from "@/lib/prisma"

function getTimeAgo(date: Date): string {
  const now = new Date()
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)
  
  if (diffInSeconds < 60) {
    return 'just now'
  }
  
  const diffInMinutes = Math.floor(diffInSeconds / 60)
  if (diffInMinutes < 60) {
    return `${diffInMinutes} minute${diffInMinutes === 1 ? '' : 's'} ago`
  }
  
  const diffInHours = Math.floor(diffInMinutes / 60)
  if (diffInHours < 24) {
    return `${diffInHours} hour${diffInHours === 1 ? '' : 's'} ago`
  }
  
  const diffInDays = Math.floor(diffInHours / 24)
  if (diffInDays < 7) {
    return `${diffInDays} day${diffInDays === 1 ? '' : 's'} ago`
  }
  
  const diffInWeeks = Math.floor(diffInDays / 7)
  if (diffInWeeks < 4) {
    return `${diffInWeeks} week${diffInWeeks === 1 ? '' : 's'} ago`
  }
  
  const diffInMonths = Math.floor(diffInDays / 30)
  if (diffInMonths < 12) {
    return `${diffInMonths} month${diffInMonths === 1 ? '' : 's'} ago`
  }
  
  const diffInYears = Math.floor(diffInDays / 365)
  return `${diffInYears} year${diffInYears === 1 ? '' : 's'} ago`
}

interface ProfileData {
  userId?: string
  firstName?: string
  lastName?: string
  userName?: string
  bio?: string
  profilePicture?: string
  publicCharts?: any
}

interface Note {
  id: string
  content: string
  visibility: string
  createdAt: string
  date?: string
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

async function getPublicNotes(userName: string): Promise<Note[]> {
  try {
    const response = await fetch(`${process.env.VERCEL_URL ? "https://" + process.env.VERCEL_URL : 'http://localhost:3000'}/api/v1/profile/${userName}/notes`, {
      cache: 'no-store' // Ensure fresh data for SSR
    })
    
    if (!response.ok) {
      return []
    }
    
    const data = await response.json()
    return data.notes || []
  } catch (error) {
    console.error('Error fetching notes:', error)
    return []
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
  const notes = await getPublicNotes(userName)
  
  if (!profile) {
    notFound()
  }

  // Get current user's username to check if they're viewing their own profile
  let currentUserUsername = null
  if (userId) {
    try {
      const user = await prisma.user.findUnique({
        where: { userId },
        include: { profile: true }
      })
      currentUserUsername = user?.profile?.userName
    } catch (error) {
      console.error('Error fetching current user profile:', error)
    }
  }

  const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(' ')
  const hasAnyPublicData = profile.firstName || profile.lastName || profile.userName || profile.bio || profile.profilePicture || notes.length > 0
  const isOwnProfile = currentUserUsername === userName
  const canAddFriend = !isOwnProfile && profile.userName
  const canEditProfile = isOwnProfile
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

        {/* Public Charts */}
        {profile.publicCharts && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Analytics</CardTitle>
            </CardHeader>
            <CardContent>
              <PublicChartsView chartsData={profile.publicCharts} />
            </CardContent>
          </Card>
        )}

        {/* Public Notes */}
        {notes.length > 0 && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {notes.map((note) => (
                  <div key={note.id} className="border rounded-lg p-4 bg-muted/30">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-muted-foreground">
                        {getTimeAgo(new Date(note.createdAt))}
                        {note.date && ` • ${note.date}`}
                      </span>
                      <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary">
                        {note.visibility.toLowerCase().replace('_', ' ')}
                      </span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{note.content}</p>
                  </div>
                ))}
              </div>
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
