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
import useSWR from 'swr'

export function BottomNav() {
  const pathname = usePathname()
  const { session, revealRedacted, setGlobalContext, setIsNavigating } = useContext(GlobalContext)
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

  const handleNavLinkClick = (href: string) => {
    // Only show skeleton if navigating to a different page
    const currentPath = pathname || ''
    const targetPath = href.startsWith('/') ? href : `/${href}`
    
    // Extract the path after locale (e.g., /en/app/feel -> /app/feel)
    // Remove locale prefix if present (format: /locale/path)
    const currentPathParts = currentPath.split('/').filter(Boolean)
    
    // If current path has locale (first part is 2-5 chars, likely locale), skip it
    const currentPathWithoutLocale = currentPathParts.length > 0 && currentPathParts[0].length <= 5
      ? '/' + currentPathParts.slice(1).join('/')
      : currentPath
    
    // Normalize paths by removing trailing slashes for comparison
    const normalizedCurrent = currentPathWithoutLocale.replace(/\/$/, '')
    const normalizedTarget = targetPath.replace(/\/$/, '')
    
    // Check if we're already on the target page (accounting for locale)
    const isSamePage = normalizedCurrent === normalizedTarget || 
                      currentPath.endsWith(targetPath) ||
                      currentPath.endsWith(targetPath + '/')
    
    if (!isSamePage) {
      setIsNavigating(true)
    }
  }

  // Check if all mood levels are zero for today
  // Fetch current day data directly from API to ensure we have the latest mood values
  const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const today = new Date()
  const todayDate = today.toLocaleString('en-uk', { timeZone: userTimezone }).split(',')[0].split('/').reverse().join('-')
  
  // Fetch day data using SWR to get the latest mood values
  const { data: dayData } = useSWR(
    session?.user ? `/api/v1/days?date=${todayDate}` : null,
    async () => {
      const response = await fetch(`/api/v1/days?date=${todayDate}`)
      if (response.ok) {
        const data = await response.json()
        return data
      }
      return { day: null }
    },
    {
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      refreshInterval: 0, // Don't auto-refresh, but allow manual revalidation
    }
  )

  const todayMood = dayData?.day?.mood || null
  const moodKeys = ['gratitude', 'optimism', 'restedness', 'tolerance', 'selfEsteem', 'trust'] as const
  const allMoodZero = todayMood 
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
                onClearQuery={() => setSearchQuery('')}
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
        <Link href="/app/feel" className="flex-1" onClick={() => handleNavLinkClick('/app/feel')}>
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
        
        <Link href="/app/do" className="flex-1" onClick={() => handleNavLinkClick('/app/do')}>
          <Button
            variant={isActive('do') ? 'default' : 'outline'}
            className={`w-full h-14 flex items-center justify-center ${
              isActive('do') ? 'bg-muted text-foreground dark:bg-foreground dark:text-background' : ''
            }`}
          >
            <CheckSquare className="w-6 h-6" />
          </Button>
        </Link>
        
        <Link href="/app/be" className="flex-1" onClick={() => handleNavLinkClick('/app/be')}>
          <Button
            variant={isActive('be') ? 'default' : 'outline'}
            className={`w-full h-14 flex items-center justify-center ${
              isActive('be') ? 'bg-muted text-foreground dark:bg-foreground dark:text-background' : ''
            }`}
          >
            <Users className="w-6 h-6" />
          </Button>
        </Link>
        
        <Link href="/app/invest" className="flex-1" onClick={() => handleNavLinkClick('/app/invest')}>
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

