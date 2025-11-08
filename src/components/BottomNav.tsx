'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useContext } from 'react'
import { Button } from '@/components/ui/button'
import { Heart, CheckSquare, Users } from 'lucide-react'
import { GlobalContext } from '@/lib/contexts'

export function BottomNav() {
  const pathname = usePathname()
  const { session } = useContext(GlobalContext)
  
  const isActive = (path: string) => pathname === path

  // Check if all mood levels are zero for today
  // Default to false (non-destructive) until user data loads
  const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const today = new Date()
  const todayDate = today.toLocaleString('en-uk', { timeZone: userTimezone }).split(',')[0].split('/').reverse().join('-')
  const year = Number(todayDate.split('-')[0])
  const user = (session as any)?.user
  const hasUserData = user && user.entries && user.entries[year] && user.entries[year].days
  const todayMood = hasUserData ? (user.entries[year].days[todayDate]?.mood) : null
  const moodKeys = ['gratitude', 'optimism', 'restedness', 'tolerance', 'selfEsteem', 'trust'] as const
  const allMoodZero = hasUserData && todayMood 
    ? moodKeys.every((k) => Number((todayMood as any)[k] ?? 0) === 0)
    : false

  return (
    <nav className="fixed bottom-0 left-0 right-0 h-[80px] bg-background border-t border-border z-50">
      <div className="h-full max-w-7xl mx-auto px-4 flex items-center justify-around gap-4">
        <Link href="/app/feel" className="flex-1">
          <Button
            variant={isActive('/app/feel') ? 'default' : 'outline'}
            className="w-full h-14 flex items-center justify-center"
            style={allMoodZero ? { backgroundColor: 'rgb(255, 106, 158)' } : undefined}
          >
            <Heart className="w-6 h-6" />
          </Button>
        </Link>
        
        <Link href="/app/do" className="flex-1">
          <Button
            variant={isActive('/app/do') ? 'default' : 'outline'}
            className="w-full h-14 flex items-center justify-center"
          >
            <CheckSquare className="w-6 h-6" />
          </Button>
        </Link>
        
        <Link href="/app/be" className="flex-1">
          <Button
            variant={isActive('/app/be') ? 'default' : 'outline'}
            className="w-full h-14 flex items-center justify-center"
          >
            <Users className="w-6 h-6" />
          </Button>
        </Link>
      </div>
    </nav>
  )
}

