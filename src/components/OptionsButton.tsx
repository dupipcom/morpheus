'use client'

import { Button } from "@/components/ui/button"
import { Circle } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { ReactNode } from "react"

export interface OptionsMenuItem {
  label: string | ReactNode
  onClick: (e: React.MouseEvent) => void
  icon?: ReactNode
  separator?: boolean
}

interface OptionsButtonProps {
  items: OptionsMenuItem[]
  statusColor?: string
  iconColor?: string
  iconFilled?: boolean
  className?: string
  align?: 'start' | 'center' | 'end'
}

export function OptionsButton({ 
  items, 
  statusColor = 'transparent', 
  iconColor = 'currentColor',
  iconFilled = false,
  className = '',
  align = 'start'
}: OptionsButtonProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={`h-8 w-8 rounded-full shrink-0 p-0 ${className}`}
          style={{ backgroundColor: statusColor }}
          onClick={(e) => e.stopPropagation()}
        >
          <Circle 
            className="h-4 w-4" 
            style={iconFilled ? { fill: iconColor } : { color: iconColor }} 
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align}>
        {items.map((item, index) => (
          <div key={index}>
            {item.separator && index > 0 && <DropdownMenuSeparator />}
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation()
                item.onClick(e)
              }}
            >
              {item.icon && <span className="mr-2">{item.icon}</span>}
              {item.label}
            </DropdownMenuItem>
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

