'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Heart, CheckSquare, Users } from 'lucide-react'

export function BottomNav() {
  const pathname = usePathname()
  
  const isActive = (path: string) => pathname === path

  return (
    <nav className="fixed bottom-0 left-0 right-0 h-[80px] bg-background border-t border-border z-50">
      <div className="h-full max-w-7xl mx-auto px-4 flex items-center justify-around gap-4">
        <Link href="/app/feel" className="flex-1">
          <Button
            variant={isActive('/app/feel') ? 'default' : 'outline'}
            className="w-full h-14 flex items-center justify-center"
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
        
        <Link href="/app/social" className="flex-1">
          <Button
            variant={isActive('/app/social') ? 'default' : 'outline'}
            className="w-full h-14 flex items-center justify-center"
          >
            <Users className="w-6 h-6" />
          </Button>
        </Link>
      </div>
    </nav>
  )
}

