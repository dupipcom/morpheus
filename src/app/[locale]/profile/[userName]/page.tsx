import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { I18nProvider } from '@/lib/contexts/i18n'
import { loadTranslations } from '@/lib/i18n'
import { auth } from '@clerk/nextjs/server'
import prisma from "@/lib/prisma"
import { ProfileView } from '@/views/profile/profileView'
import { cachedInternalGet } from '@/lib/public/internalFetch'


interface ProfileData {
  userId?: string
  firstName?: string
  lastName?: string
  userName?: string
  bio?: string
  profilePicture?: string
  publicCharts?: any
}

// Profile fetch is cached by cachedInternalGet (React.cache) to avoid duplicate
// requests between generateMetadata and the page component
const getProfile = async (userName: string): Promise<ProfileData | null> => {
  const data = await cachedInternalGet<{ profile?: ProfileData }>(`/api/v1/profile/${userName}`)
  return data?.profile ?? null
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
  const { userId } = await auth()
  const translations = await loadTranslations(locale as any)
  
  const profile = await getProfile(userName)
  
  if (!profile) {
    notFound()
  }

  // Get current user's username to check if they're viewing their own profile
  let currentUserUsername = null
  if (userId) {
    try {
      const user = await prisma.user.findUnique({
        where: { userId },
        include: { profiles: true }
      })
      const profileData = user?.profiles?.[0]?.data as any
      currentUserUsername = profileData?.username?.value || null
    } catch (error) {
      console.error('Error fetching current user profile:', error)
    }
  }

  const isLoggedIn = !!userId

  return (
    <I18nProvider locale={locale as any}>
      <ProfileView 
        profile={profile}
        userName={userName}
        locale={locale}
        currentUserUsername={currentUserUsername}
                    isLoggedIn={isLoggedIn}
        translations={translations}
      />
    </I18nProvider>
  )
}
