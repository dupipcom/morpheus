'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useContext, useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Heart, CheckSquare, Users, Coins, Eye, EyeOff, Globe, Hourglass, Search, Gauge, X, Play, Square as Stop, CircleUser } from 'lucide-react'
import { GlobalContext } from '@/lib/contexts'
import { useLocalStorage } from 'usehooks-ts'
import { useI18n } from '@/lib/contexts/i18n'
import { SearchPopover } from '@/components/searchPopover'
import { NotificationsButton } from '@/components/notificationsButton'
import { DEFAULT_TRACKS } from '@/components/ui/nav'
import Hls from 'hls.js'
import { logger } from '@/lib/logger'
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

  // Audio player logic
  const audioElement = useRef<HTMLAudioElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const [audioReady, setAudioReady] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const selectedTrack = DEFAULT_TRACKS[1]
  const playerIcon = useMemo(() => isPlaying ? <Stop className="h-4 w-4" /> : <Play className="h-4 w-4" />, [isPlaying])

  const handlePlaying = useCallback(() => {
    setIsPlaying(true)
  }, [])

  const handleStopping = useCallback(() => {
    setIsPlaying(false)
  }, [])

  const handleStalled = useCallback(() => {
    // Handle stalled state if needed
  }, [])

  const isHlsStream = useCallback((url: string) => {
    return url.includes('.m3u8') || url.includes('application/vnd.apple.mpegurl')
  }, [])

  const initializeHls = useCallback(() => {
    const audio = audioElement.current
    if (!audio || !selectedTrack.url) return

    if (hlsRef.current) {
      hlsRef.current.destroy()
      hlsRef.current = null
    }

    if (isHlsStream(selectedTrack.url)) {
      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
          backBufferLength: 90,
        })
        
        hls.loadSource(selectedTrack.url)
        hls.attachMedia(audio)
        
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          logger('hls_manifest_parsed', 'HLS manifest loaded')
        })
        
        hls.on(Hls.Events.ERROR, (event, data) => {
          if (data.fatal) {
            if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
              hls.startLoad()
            } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
              hls.recoverMediaError()
            }
          }
        })
        
        hlsRef.current = hls
      } else if (audio.canPlayType('application/vnd.apple.mpegurl')) {
        audio.src = selectedTrack.url
      }
    } else {
      audio.src = selectedTrack.url
    }
  }, [selectedTrack.url, isHlsStream])

  const handlePlay = useCallback(() => {
    const isHls = isHlsStream(selectedTrack.url)
    const audio = audioElement.current
    if (!audio) return

    if (isHls && !hlsRef.current && Hls.isSupported()) {
      initializeHls()
    }

    if (!isHls && audio.readyState === 0) {
      audio.load()
    }

    if (!isHls && !audio.src) {
      return
    }

    try {
      const playPromise = audio.play()
      if (playPromise !== undefined) {
        playPromise.catch((e: any) => {
          console.error('Audio play error:', e)
        })
      }
    } catch (e: any) {
      console.error('Audio play exception:', e)
    }
  }, [selectedTrack.url, isHlsStream, initializeHls])

  const handleStop = useCallback(() => {
    const audio = audioElement.current
    if (!audio) return
    try {
      audio.pause()
    } catch (e: any) {
      console.error('Audio stop error:', e)
    }
  }, [])

  const handlePlayerClick = useCallback(() => {
    if (!audioElement.current) return
    if (isPlaying) {
      handleStop()
    } else {
      handlePlay()
    }
  }, [isPlaying, handlePlay, handleStop])

  useEffect(() => {
    if (!audioReady) return
    const audio = audioElement.current
    if (!audio) return

    initializeHls()

    if (!audio.paused) {
      setIsPlaying(true)
    }

    audio.addEventListener('play', handlePlaying)
    audio.addEventListener('playing', handlePlaying)
    audio.addEventListener('pause', handleStopping)
    audio.addEventListener('ended', handleStopping)
    audio.addEventListener('stalled', handleStalled)

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy()
        hlsRef.current = null
      }
      if (audio) {
        audio.removeEventListener('play', handlePlaying)
        audio.removeEventListener('playing', handlePlaying)
        audio.removeEventListener('pause', handleStopping)
        audio.removeEventListener('ended', handleStopping)
        audio.removeEventListener('stalled', handleStalled)
      }
    }
  }, [audioReady, handlePlaying, handleStopping, handleStalled, initializeHls])

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
        <div className="h-full max-w-7xl mx-auto px-4 flex items-center justify-center gap-2">
          {/* Search - Collapsible (First Button) */}
          <div className="flex items-center gap-2">
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
            className={`flex items-center gap-2 transition-all duration-300 ease-in-out ${
              isSearchExpanded 
                ? 'opacity-0 w-0 overflow-hidden -translate-x-4' 
                : 'opacity-100 w-auto translate-x-0'
            }`}
          >
            {/* Dashboard Button */}
            <Link href="/app/dashboard" onClick={() => handleNavLinkClick('/app/dashboard')}>
              <Button
                variant={isActive('dashboard') ? 'default' : 'outline'}
                size="icon"
                className={`h-9 w-9 ${
                  isActive('dashboard') ? 'bg-muted text-foreground dark:bg-foreground dark:text-background' : ''
                }`}
                aria-label={t('common.dashboard')}
              >
                <Gauge className="h-4 w-4" />
              </Button>
            </Link>

            {/* Notifications Button */}
            <NotificationsButton size="icon" className="h-9 w-9" />

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

            {/* Audio Player */}
            <div>
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9"
                onClick={handlePlayerClick}
                aria-label={isPlaying ? 'Stop audio' : 'Play audio'}
              >
                {playerIcon}
              </Button>
              <audio
                ref={(el) => {
                  audioElement.current = el
                  if (el) {
                    setAudioReady(true)
                    el.addEventListener('canplay', () => {
                      logger('audio_canplay', 'Audio ready to play')
                    })
                    el.addEventListener('error', (e: any) => {
                      logger('audio_element_error', {
                        error: e,
                        code: el.error?.code,
                        message: el.error?.message,
                        src: el.src,
                      })
                    })
                  }
                }}
                loop
                preload="auto"
                crossOrigin="anonymous"
              />
            </div>

            {/* Profile Button */}
            <Link href="/app/profile" onClick={() => handleNavLinkClick('/app/profile')}>
              <Button
                variant={isActive('profile') ? 'default' : 'outline'}
                size="icon"
                className={`h-9 w-9 ${
                  isActive('profile') ? 'bg-muted text-foreground dark:bg-foreground dark:text-background' : ''
                }`}
                aria-label={t('common.profile')}
              >
                <CircleUser className="h-4 w-4" />
              </Button>
            </Link>

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

