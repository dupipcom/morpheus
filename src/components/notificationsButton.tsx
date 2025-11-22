'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuTrigger,
} from '@/components/ui/dropdownMenu'
import { Bell, Loader2 } from 'lucide-react'
import { useI18n } from '@/lib/contexts/i18n'

interface NotificationsButtonProps {
  className?: string
  size?: 'default' | 'sm' | 'lg' | 'icon'
}

export function NotificationsButton({ className, size = 'default' }: NotificationsButtonProps = {}) {
  const { t } = useI18n()
  const [notifications, setNotifications] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isOpen, setIsOpen] = useState(false)

  // Fetch notifications
  const fetchNotifications = async () => {
    try {
      // TODO: Replace with actual notifications API endpoint when available
      // const response = await fetch('/api/v1/notifications')
      // if (response.ok) {
      //   const data = await response.json()
      //   setNotifications(data.notifications || [])
      // }
      setNotifications([])
    } catch (error) {
      console.error('Error fetching notifications:', error)
    } finally {
      setIsLoading(false)
    }
  }

  // Fetch notifications when component mounts
  useEffect(() => {
    fetchNotifications()
  }, [])

  // Refresh notifications when dropdown opens
  useEffect(() => {
    if (isOpen) {
      fetchNotifications()
    }
  }, [isOpen])

  const notificationCount = notifications.length

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size={size} className={`relative ${className || ''}`}>
          <Bell className="w-4 h-4" />
          {notificationCount > 0 && (
            <Badge 
              variant="destructive" 
              className="absolute -top-2 -right-2 h-5 w-5 flex items-center justify-center p-0 text-xs"
            >
              {notificationCount > 9 ? '9+' : notificationCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 z-[1002]">
        <div className="p-2">
          <h3 className="font-semibold text-sm">{t('common.notifications') || 'Notifications'}</h3>
          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-4 h-4 animate-spin" />
            </div>
          ) : notifications.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              {t('common.noNotifications') || 'No notifications'}
            </p>
          ) : (
            <div className="space-y-2 mt-2 max-h-60 overflow-y-auto">
              {notifications.map((notification) => (
                <div key={notification.id} className="flex items-start space-x-3 p-2 rounded-lg hover:bg-muted">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {notification.title || notification.message}
                    </p>
                    {notification.timestamp && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(notification.timestamp).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

