import React from 'react'
import { Instagram, Facebook, Twitter, Youtube, Linkedin, MessageCircle, Send, Link as LinkIcon } from 'lucide-react'
import type { SocialPlatform } from '@/lib/utils/profileUtils'

interface SocialLinkIconProps {
  type: SocialPlatform | string
  className?: string
}

export function SocialLinkIcon({ type, className }: SocialLinkIconProps) {
  const cls = className || 'w-4 h-4'
  switch (type) {
    case 'instagram': return <Instagram className={cls} aria-hidden="true" />
    case 'facebook': return <Facebook className={cls} aria-hidden="true" />
    case 'twitter': return <Twitter className={cls} aria-hidden="true" />
    case 'youtube': return <Youtube className={cls} aria-hidden="true" />
    case 'linkedin': return <Linkedin className={cls} aria-hidden="true" />
    case 'discord': return <MessageCircle className={cls} aria-hidden="true" />
    case 'telegram': return <Send className={cls} aria-hidden="true" />
    case 'tiktok':
      return (
        <span className={`${cls} font-bold text-xs flex items-center justify-center`} aria-label="TikTok">
          TK
        </span>
      )
    default: return <LinkIcon className={cls} aria-hidden="true" />
  }
}

const SOCIAL_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  twitter: 'X',
  tiktok: 'TikTok',
  linkedin: 'LinkedIn',
  youtube: 'YouTube',
  discord: 'Discord',
  telegram: 'Telegram',
}

export function getSocialLabel(type: string): string {
  return SOCIAL_LABELS[type] || 'Link'
}
