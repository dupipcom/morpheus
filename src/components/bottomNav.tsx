'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useContext, useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Heart, CheckSquare, Users, Coins, Eye, EyeOff, Globe, Hourglass, Search, Gauge, X, CircleUser, BookOpen, Mail, Headphones } from 'lucide-react'
import { GlobalContext } from '@/lib/contexts'
import { useLocalStorage } from 'usehooks-ts'
import { useI18n } from '@/lib/contexts/i18n'
import { SearchPopover } from '@/components/searchPopover'
import { NotificationsButton } from '@/components/notificationsButton'
import { ChatNavButton } from '@/components/chat/chatNavButton'
import useSWR from 'swr'

export function BottomNav() {
  const pathname = usePathname()
  const { session, revealRedacted, setGlobalContext, setIsNavigating } = useContext(GlobalContext)
  const { t } = useI18n()
  const [redactedValue, setRedactedValue] = useLocalStorage('dpip_redacted', 0)
  const [isSpace, setIsSpace] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [isSearchExpanded, setIsSearchExpanded] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  
  // Check if the current pathname matches the given path
  // Matches exact path or paths that start with the given path followed by '/'
  const isActive = (path: string) => {
    // Check both [2] (for routes like /en/magazine) and [3] (for routes like /en/app/dashboard)
    const pathParts = pathname.split('/')
    const rootPath2 = pathParts[2]
    const rootPath3 = pathParts[3]
    if (rootPath2 === path || rootPath3 === path) return true
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

  const handleSearchButtonClick = () => {
    setIsSearchExpanded(!isSearchExpanded)
    if (!isSearchExpanded) {
      // Focus the input when expanding
      setTimeout(() => {
        searchInputRef.current?.focus()
      }, 100)
    } else {
      // Clear search when collapsing
      setSearchQuery('')
      setSearchOpen(false)
    }
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
      <div className="bottom-nav-interactive fixed bottom-[80px] left-0 right-0 h-[50px] bg-background border-t border-border z-[1002]">
        <div className="h-full max-w-7xl mx-auto px-4 flex items-center gap-2 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] md:justify-center">
          {/* Search - Collapsible (First Button) */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <form 
              onSubmit={handleSearchSubmit} 
              className={`flex items-center gap-2 relative transition-all duration-300 ease-in-out overflow-hidden ${
                isSearchExpanded ? 'w-[200px] opacity-100' : 'w-0 opacity-0'
              }`}
            >
              <div className="relative w-full min-w-[200px]">
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
                  onCollapseSearch={() => setIsSearchExpanded(false)}
                />
              </div>
            </form>
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9"
              onClick={handleSearchButtonClick}
              aria-label={isSearchExpanded ? 'Close search' : 'Open search'}
            >
              {isSearchExpanded ? <X className="h-4 w-4" /> : <Search className="h-4 w-4" />}
            </Button>
          </div>

          {/* Other Menu Buttons - Hide when search is expanded */}
          <div 
            className={`flex items-center gap-2 transition-all duration-300 ease-in-out flex-shrink-0 ${
              isSearchExpanded 
                ? 'opacity-0 w-0 overflow-hidden -translate-x-4' 
                : 'opacity-100 w-auto translate-x-0'
            }`}
          >
            {/* Dashboard Button */}
            <Button
              asChild
              variant={isActive('dashboard') ? 'default' : 'outline'}
              size="icon"
              className={`h-9 w-9 ${
                isActive('dashboard') ? 'bg-muted text-foreground dark:bg-foreground dark:text-background' : ''
              }`}
              aria-label={t('common.dashboard')}
            >
              <Link href="/app/dashboard" onClick={() => handleNavLinkClick('/app/dashboard')}>
                <Gauge className="h-4 w-4" />
              </Link>
            </Button>

            {/* Read Button */}
            <Button
              asChild
              variant={isActive('magazine') ? 'default' : 'outline'}
              size="icon"
              className={`h-9 w-9 ${
                isActive('magazine') ? 'bg-muted text-foreground dark:bg-foreground dark:text-background' : ''
              }`}
              aria-label="Read"
            >
              <Link href="/magazine" onClick={() => handleNavLinkClick('/magazine')}>
                <BookOpen className="h-4 w-4" />
              </Link>
            </Button>

            {/* Notifications Button */}
            <NotificationsButton size="icon" className="h-9 w-9" />

            {/* Chat Button */}
            <ChatNavButton isActive={isActive('chat')} onClick={() => handleNavLinkClick('/app/chat')} size="icon" className="h-9 w-9" />

            {/* Mail Button */}
            <Button
              asChild
              variant="outline"
              size="icon"
              className="h-9 w-9"
              aria-label="Mail"
            >
              <a href="https://mail.dupip.com" target="_blank" rel="noopener noreferrer">
                <Mail className="h-4 w-4" />
              </a>
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

            {/* Mixcloud / Episodes */}
            <Button
              asChild
              variant="outline"
              size="icon"
              className="h-9 w-9"
              aria-label={t('common.episodes')}
            >
              <a href="/episodes" target="_blank" rel="noopener noreferrer">
                <Headphones className="h-4 w-4" />
              </a>
            </Button>

            {/* Profile Button */}
            <Button
              asChild
              variant={isActive('profile') ? 'default' : 'outline'}
              size="icon"
              className={`h-9 w-9 ${
                isActive('profile') ? 'bg-muted text-foreground dark:bg-foreground dark:text-background' : ''
              }`}
              aria-label={t('common.profile')}
            >
              <Link href="/app/profile" onClick={() => handleNavLinkClick('/app/profile')}>
                <CircleUser className="h-4 w-4" />
              </Link>
            </Button>

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
          </div>
        </div>
      </div>

      {/* Bottom Navigation */}
      <nav className="bottom-nav-interactive fixed bottom-0 left-0 right-0 h-[80px] bg-background border-t border-border z-[1002]">
        <div className="h-full max-w-7xl mx-auto px-4 flex items-center justify-around gap-4">
        <Button
          asChild
          variant={isActive('feel') ? 'default' : 'outline'}
          key={`feel--${allMoodZero ? 'destructive' : 'primary'}--${isActive('feel') ? 'active' : 'inactive'}`}
          className={`flex-1 w-full h-14 flex items-center justify-center ${
            allMoodZero ? '!bg-destructive !text-foreground' : ''
          } ${
            isActive('feel') ? 'bg-muted text-foreground dark:bg-foreground dark:text-background' : ''
          } `}
        >
          <Link href="/app/feel" onClick={() => handleNavLinkClick('/app/feel')}>
            <Heart className="w-6 h-6" />
          </Link>
        </Button>
        
        <Button
          asChild
          variant={isActive('do') ? 'default' : 'outline'}
          className={`flex-1 w-full h-14 flex items-center justify-center ${
            isActive('do') ? 'bg-muted text-foreground dark:bg-foreground dark:text-background' : ''
          }`}
        >
          <Link href="/app/do" onClick={() => handleNavLinkClick('/app/do')}>
            <CheckSquare className="w-6 h-6" />
          </Link>
        </Button>
        
        <Button
          asChild
          variant={isActive('be') ? 'default' : 'outline'}
          className={`flex-1 w-full h-14 flex items-center justify-center ${
            isActive('be') ? 'bg-muted text-foreground dark:bg-foreground dark:text-background' : ''
          }`}
        >
          <Link href="/app/be" onClick={() => handleNavLinkClick('/app/be')}>
            <Users className="w-6 h-6" />
          </Link>
        </Button>
        
        <Button
          asChild
          variant={isActive('invest') ? 'default' : 'outline'}
          className={`flex-1 w-full h-14 flex items-center justify-center ${
            isActive('invest') ? 'bg-muted text-foreground dark:bg-foreground dark:text-background' : ''
          }`}
        >
          <Link href="/app/invest" onClick={() => handleNavLinkClick('/app/invest')}>
            <Coins className="w-6 h-6" />
          </Link>
        </Button>
      </div>
    </nav>
    </>
  )
}

