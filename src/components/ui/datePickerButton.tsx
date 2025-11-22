'use client'

import { useContext, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { Calendar as CalendarIcon } from 'lucide-react'
import { GlobalContext } from '@/lib/contexts'
import { useI18n } from '@/lib/contexts/i18n'
import { cn } from '@/lib/utils'
import { getWeekNumber } from '@/app/helpers'

interface DatePickerButtonProps {
  /**
   * Optional function to format the date for display.
   * If not provided, uses default formatting.
   */
  formatDate?: (date: Date | undefined) => string
  /**
   * Optional condition to determine if the date picker should be shown.
   * If not provided, always shows.
   */
  shouldShow?: boolean
  /**
   * Optional role/type to determine if weekly formatting should be used.
   * If the role starts with 'weekly.', shows week number format.
   */
  role?: string
  /**
   * Optional className to add to the button
   */
  className?: string
  /**
   * Optional size for the button
   */
  size?: 'default' | 'sm' | 'lg' | 'icon'
}

export const DatePickerButton = ({ 
  formatDate: customFormatDate, 
  shouldShow = true,
  role,
  className,
  size = 'sm'
}: DatePickerButtonProps) => {
  const { t } = useI18n()
  const { selectedDate, setSelectedDate } = useContext(GlobalContext)

  // Default format date function
  const formatDate = useMemo(() => {
    if (customFormatDate) {
      return customFormatDate
    }
    
    return (date: Date | undefined) => {
      if (!date) return t('tasks.selectDate') || 'Select date'
      
      // For weekly lists, show week number
      if (role && role.startsWith('weekly.')) {
        const [, weekNum] = getWeekNumber(date)
        return `Week ${weekNum}, ${date.getFullYear()}`
      }
      
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    }
  }, [customFormatDate, role, t])

  if (!shouldShow) {
    return null
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size={size}
          className={cn(
            "justify-start text-left font-normal shrink-0 mr-2",
            !selectedDate && "text-muted-foreground",
            className
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {formatDate(selectedDate)}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end">
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={setSelectedDate}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  )
}

