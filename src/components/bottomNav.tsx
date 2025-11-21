'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useContext, useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Heart, CheckSquare, Users, Coins, Eye, EyeOff, Globe, Hourglass, Search } from 'lucide-react'
import { GlobalContext } from '@/lib/contexts'
import { useLocalStorage } from 'usehooks-ts'
import { useI18n } from '@/lib/contexts/i18n'
import { SearchPopover } from '@/components/searchPopover'

export function BottomNav() {
  const pathname = usePathname()
  const { session, revealRedacted, setGlobalContext } = useContext(GlobalContext)
  const { t } = useI18n()
  const [redactedValue, setRedactedValue] = useLocalStorage('dpip_redacted', 0)
  const [isSpace, setIsSpace] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  
  // Check if the current pathname matches the given path
  // Matches exact path or paths that start with the given path followed by '/'
  const isActive = (path: string) => {
    // Exact match
    const rootPath = pathname.split('/')[3]
    if (rootPath === path) return true
    return false
  }

  const handleVisibilityToggle = () => {
    const newRevealState = !revealRedacted
    const newValue = newRevealState ? 1 : 0
    setRedactedValue(newValue)
    setGlobalContext((prev: any) => ({ ...prev, revealRedacted: newRevealState }))
  }

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // Handle search submission here
    console.log('Search query:', searchQuery)
  }

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setSearchQuery(value)
    setSearchOpen(value.length >= 2)
  }

  const handleSearchFocus = () => {
    if (searchQuery.length >= 2) {
      setSearchOpen(true)
    }
  }

  const handleSearchBlur = () => {
    // Delay closing to allow click on results
    setTimeout(() => {
      setSearchOpen(false)
    }, 200)
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
    <>
      {/* Bottom Toolbar */}
      <div className="fixed bottom-[80px] left-0 right-0 h-[50px] bg-background border-t border-border z-50">
        <div className="h-full max-w-7xl mx-auto px-4 flex items-center gap-2">
          {/* Visibility Toggle */}
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9"
            onClick={handleVisibilityToggle}
            aria-label={revealRedacted ? 'Hide sensitive tasks' : 'Reveal sensitive tasks'}
          >
            {revealRedacted ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>

          {/* Space/Time Toggle */}
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9"
            onClick={() => setIsSpace(!isSpace)}
            aria-label={isSpace ? 'Switch to time' : 'Switch to space'}
          >
            {isSpace ? <Globe className="h-4 w-4" /> : <Hourglass className="h-4 w-4" />}
          </Button>

          {/* Ask Input */}
          <form onSubmit={handleSearchSubmit} className="flex-1 flex items-center gap-2 relative">
            <div className="flex-1 relative">
            <Input
                ref={searchInputRef}
              type="text"
              placeholder={`${t('common.ask')}...`}
              value={searchQuery}
                onChange={handleSearchChange}
                onFocus={handleSearchFocus}
                onBlur={handleSearchBlur}
                className="h-9 w-full"
            />
              <SearchPopover
                query={searchQuery}
                open={searchOpen}
                onOpenChange={setSearchOpen}
                anchorRef={searchInputRef}
              />
            </div>
            <Button
              type="submit"
              variant="outline"
              size="icon"
              className="h-9 w-9"
              aria-label={`${t('common.ask')}`}
            >
              <Search className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </div>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 h-[80px] bg-background border-t border-border z-50">
        <div className="h-full max-w-7xl mx-auto px-4 flex items-center justify-around gap-4">
        <Link href="/app/feel" className="flex-1">
          <Button
            variant={isActive('feel') ? 'default' : 'outline'}
            key={`feel--${allMoodZero ? 'destructive' : 'primary'}--${isActive('feel') ? 'active' : 'inactive'}`}
            className={`w-full h-14 flex items-center justify-center ${
              allMoodZero ? '!bg-destructive !text-foreground' : ''
            } ${
              isActive('feel') ? 'bg-muted text-foreground dark:bg-foreground dark:text-background' : ''
            } `}
          >
            <Heart className="w-6 h-6" />
          </Button>
        </Link>
        
        <Link href="/app/do" className="flex-1">
          <Button
            variant={isActive('do') ? 'default' : 'outline'}
            className={`w-full h-14 flex items-center justify-center ${
              isActive('do') ? 'bg-muted text-foreground dark:bg-foreground dark:text-background' : ''
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
              isActive('invest') ? 'bg-muted text-foreground dark:bg-foreground dark:text-background' : ''
            }`}
          >
            <Coins className="w-6 h-6" />
          </Button>
        </Link>
      </div>
    </nav>
    </>
  )
}

