'use client'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Lock, Users, UserCheck, Globe, Sparkles } from "lucide-react"
import { useI18n } from "@/lib/contexts/i18n"

export type VisibilityOption = 'PRIVATE' | 'FRIENDS' | 'CLOSE_FRIENDS' | 'PUBLIC' | 'AI_ENABLED'

interface VisibilitySelectProps {
  value: VisibilityOption | string
  onValueChange: (value: VisibilityOption) => void
  className?: string
  showIconOnMobile?: boolean
  iconOnly?: boolean
  availableOptions?: VisibilityOption[]
}

const getVisibilityIcon = (visibility: string) => {
  switch (visibility) {
    case 'PRIVATE':
      return <Lock className="h-4 w-4" />
    case 'FRIENDS':
      return <Users className="h-4 w-4" />
    case 'CLOSE_FRIENDS':
      return <UserCheck className="h-4 w-4" />
    case 'PUBLIC':
      return <Globe className="h-4 w-4" />
    case 'AI_ENABLED':
      return <Sparkles className="h-4 w-4" />
    default:
      return <Lock className="h-4 w-4" />
  }
}

export const VisibilitySelect = ({ 
  value, 
  onValueChange, 
  className = "w-full min-h-[40px] sm:w-48 sm:h-auto justify-center md:justify-between",
  showIconOnMobile = true,
  iconOnly = false,
  availableOptions = ['PRIVATE', 'FRIENDS', 'CLOSE_FRIENDS', 'PUBLIC', 'AI_ENABLED']
}: VisibilitySelectProps) => {
  const { t } = useI18n()

  const allOptions: { value: VisibilityOption; label: string; icon: JSX.Element }[] = [
    {
      value: 'PRIVATE',
      label: t('mood.publish.visibility.PRIVATE') || 'Private',
      icon: <Lock className="h-4 w-4" />
    },
    {
      value: 'FRIENDS',
      label: t('mood.publish.visibility.FRIENDS') || 'Friends',
      icon: <Users className="h-4 w-4" />
    },
    {
      value: 'CLOSE_FRIENDS',
      label: t('mood.publish.visibility.CLOSE_FRIENDS') || 'Close Friends',
      icon: <UserCheck className="h-4 w-4" />
    },
    {
      value: 'PUBLIC',
      label: t('mood.publish.visibility.PUBLIC') || 'Public',
      icon: <Globe className="h-4 w-4" />
    },
    {
      value: 'AI_ENABLED',
      label: t('mood.publish.visibility.AI_ENABLED') || 'AI Enabled',
      icon: <Sparkles className="h-4 w-4" />
    }
  ]

  const filteredOptions = allOptions.filter(option => availableOptions.includes(option.value))

  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className={className}>
        {iconOnly ? (
          <span className="flex items-center justify-center">
            {getVisibilityIcon(value)}
          </span>
        ) : (
          <>
            {showIconOnMobile && (
              <span className="sm:hidden">
                {getVisibilityIcon(value)}
              </span>
            )}
            <span className={showIconOnMobile ? "hidden sm:block" : ""}>
              <SelectValue />
            </span>
          </>
        )}
      </SelectTrigger>
      <SelectContent>
        {filteredOptions.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            <div className="flex items-center gap-2">
              {option.icon}
              <span>{option.label}</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

