'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useContext } from 'react'
import { Button } from '@/components/ui/button'
import { Heart, CheckSquare, Users, Coins } from 'lucide-react'
import { GlobalContext } from '@/lib/contexts'

export function BottomNav() {
  const pathname = usePathname()
  const { session } = useContext(GlobalContext)
  
  // Check if the current pathname matches the given path
  // Matches exact path or paths that start with the given path followed by '/'
  const isActive = (path: string) => {
    // Exact match
    const rootPath = pathname.split('/')[3]
    console.log({ rootPath })
    if (rootPath === path) return true
    // Sub-route match (e.g., /app/do/something matches /app/do)
    if (rootPath.startsWith(path + '/')) return true
    return false
  }

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
            variant={isActive('feel') ? 'default' : 'outline'}
            key={`feel--${allMoodZero ? 'destructive' : 'primary'}--${isActive('feel') ? 'active' : 'inactive'}`}
            className={`w-full h-14 flex items-center justify-center ${
              allMoodZero ? '!bg-destructive !text-foreground' : ''
            } ${
              isActive('feel') ? 'bg-primary dark:bg-foreground text-background' : ''
            } `}
          >
            <Heart className="w-6 h-6" />
          </Button>
        </Link>
        
        <Link href="/app/do" className="flex-1">
          <Button
            variant={isActive('do') ? 'default' : 'outline'}
            className={`w-full h-14 flex items-center justify-center ${
              isActive('do') ? 'bg-primary text-primary-foreground' : ''
            }`}
          >
            <CheckSquare className="w-6 h-6" />
          </Button>
        </Link>
        
        <Link href="/app/be" className="flex-1">
          <Button
            variant={isActive('be') ? 'default' : 'outline'}
            className={`w-full h-14 flex items-center justify-center ${
              isActive('be') ? 'bg-muted text-foreground dark:bg-foreground dark:text-background' : ''
            }`}
          >
            <Users className="w-6 h-6" />
          </Button>
        </Link>
        
        <Link href="/app/invest" className="flex-1">
          <Button
            variant={isActive('invest') ? 'default' : 'outline'}
            className={`w-full h-14 flex items-center justify-center ${
              isActive('invest') ? 'bg-primary text-primary-foreground' : ''
            }`}
          >
            <Coins className="w-6 h-6" />
          </Button>
        </Link>
      </div>
    </nav>
  )
}

