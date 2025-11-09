import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { I18nProvider } from '@/lib/contexts/i18n'
import { loadTranslations } from '@/lib/i18n'
import { ProfileView } from '@/views/profileView'

interface ProfileData {
  firstName?: string
  lastName?: string
  userName?: string
  bio?: string
  profilePicture?: string
  publicCharts?: any
}

async function getProfile(userName: string): Promise<ProfileData | null> {
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/v1/profile/${userName}`, {
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

export async function generateMetadata({ params }: { params: Promise<{ userName: string }> }): Promise<Metadata> {
  const { userName } = await params
  
  // Only match usernames that start with @
  if (!userName.startsWith('@')) {
    return {
      title: 'Page Not Found',
      description: 'The requested page could not be found.'
    }
  }
  
  // Remove the @ prefix for the actual username
  const actualUserName = userName.substring(1)
  const profile = await getProfile(actualUserName)
  
  if (!profile) {
    return {
      title: 'Profile Not Found',
      description: 'The requested profile could not be found.'
    }
  }

  const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(' ')
  const title = profile.userName ? `@${profile.userName} · Dupip` : 'Dupip Profile'
  const description = profile.bio || `View ${fullName || profile.userName || 'this user'}'s profile on Dupip`

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
  const isLoggedIn = false // Public route without Clerk context; treat as logged out
  
  // Only match usernames that start with @
  if (!userName.startsWith('@')) {
    notFound()
  }
  
  // Remove the @ prefix for the actual username
  const actualUserName = userName.substring(1)
  const profile = await getProfile(actualUserName)
  const translations = await loadTranslations(locale as any)

  if (!profile) {
    notFound()
  }

  return (
    <I18nProvider locale={locale as any}>
      <ProfileView 
        profile={profile}
        userName={actualUserName}
        locale={locale}
        currentUserUsername={null}
        isLoggedIn={isLoggedIn}
        translations={translations}
      />
    </I18nProvider>
  )
}
