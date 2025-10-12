'use client'

import { AddFriendButton } from './AddFriendButton'
import { Button } from '@/components/ui/button'
import { UserPlus, LogIn, Edit } from 'lucide-react'
import { SignInButton } from '@clerk/nextjs'
import { useI18n } from '@/lib/contexts/i18n'
import Link from 'next/link'

interface AddFriendButtonOrSignInProps {
  targetUserName: string
  isLoggedIn: boolean
  currentUserName?: string
  className?: string
}

export function AddFriendButtonOrSignIn({ targetUserName, isLoggedIn, currentUserName, className }: AddFriendButtonOrSignInProps) {
  const { t } = useI18n()
  
  // If user is viewing their own profile, show Edit Profile button
  if (isLoggedIn && currentUserName && currentUserName === targetUserName) {
    return (
      <Link href="/app/profile/edit">
        <Button className={className}>
          <Edit className="w-4 h-4 mr-2" />
          {t('friends.editProfile')}
        </Button>
      </Link>
    )
  }
  
  if (isLoggedIn) {
    return <AddFriendButton targetUserName={targetUserName} className={className} />
  }

  return (
    <SignInButton>
      <Button className={className}>
        <LogIn className="w-4 h-4 mr-2" />
        {t('friends.signInToAdd')}
      </Button>
    </SignInButton>
  )
}
