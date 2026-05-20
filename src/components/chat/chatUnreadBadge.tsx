import { Badge } from '@/components/ui/badge'

interface ChatUnreadBadgeProps {
  count: number
  className?: string
}

export function ChatUnreadBadge({ count, className }: ChatUnreadBadgeProps) {
  if (count <= 0) return null

  return (
    <Badge variant="destructive" className={className}>
      {count > 99 ? '99+' : count}
    </Badge>
  )
}
