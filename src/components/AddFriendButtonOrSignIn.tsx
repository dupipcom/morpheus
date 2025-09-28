'use client'

import { AddFriendButton } from './AddFriendButton'
import { Button } from '@/components/ui/button'
import { UserPlus, LogIn } from 'lucide-react'
import { SignInButton } from '@clerk/nextjs'

interface AddFriendButtonOrSignInProps {
  targetUserId: string
  isLoggedIn: boolean
  className?: string
}

export function AddFriendButtonOrSignIn({ targetUserId, isLoggedIn, className }: AddFriendButtonOrSignInProps) {
  if (isLoggedIn) {
    return <AddFriendButton targetUserId={targetUserId} className={className} />
  }

  return (
    <SignInButton>
      <Button className={className}>
        <LogIn className="w-4 h-4 mr-2" />
        Sign In to Add Friend
      </Button>
    </SignInButton>
  )
}
