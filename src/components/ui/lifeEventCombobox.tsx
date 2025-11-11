"use client"
import * as React from "react"
import { Check, ChevronsUpDown, Plus, Calendar } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { useI18n } from "@/lib/contexts/i18n"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Slider } from "@/components/ui/slider"
import { Badge } from "@/components/ui/badge"
import { X } from "lucide-react"

interface LifeEvent {
  id: string
  name: string
  notes?: string
  quality?: number
}

interface LifeEventReference {
  id: string
  name: string
  quality?: number
}

interface LifeEventComboboxProps {
  lifeEvents: LifeEvent[]
  selectedLifeEvents: LifeEventReference[]
  onLifeEventsChange: (lifeEvents: LifeEventReference[]) => void
  onAddLifeEvent?: (lifeEvent: LifeEvent) => void
  onLifeEventsRefresh?: () => void
}

export function LifeEventCombobox({
  lifeEvents,
  selectedLifeEvents,
  onLifeEventsChange,
  onAddLifeEvent,
  onLifeEventsRefresh
}: LifeEventComboboxProps) {
  const { t } = useI18n()
  const [open, setOpen] = React.useState(false)
  const [addLifeEventOpen, setAddLifeEventOpen] = React.useState(false)
  const [searchValue, setSearchValue] = React.useState("")

  const [newLifeEvent, setNewLifeEvent] = React.useState({
    name: '',
    notes: '',
    quality: 3
  })

  const handleSelect = (lifeEventId: string) => {
    if (lifeEventId === 'add-new') {
      setAddLifeEventOpen(true)
      return
    }

    const lifeEvent = lifeEvents.find(le => le.id === lifeEventId)
    if (lifeEvent && !selectedLifeEvents.find(sle => sle.id === lifeEvent.id)) {
      const lifeEventRef: LifeEventReference = {
        id: lifeEvent.id,
        name: lifeEvent.name,
        quality: lifeEvent.quality || 3
      }
      onLifeEventsChange([...selectedLifeEvents, lifeEventRef])
    }
    setOpen(false)
  }

  const handleRemoveLifeEvent = (lifeEventId: string) => {
    onLifeEventsChange(selectedLifeEvents.filter(le => le.id !== lifeEventId))
  }

  const handleAddNewLifeEvent = async () => {
    if (!newLifeEvent.name.trim()) return

    try {
      const response = await fetch('/api/v1/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newLifeEvent),
      })

      if (response.ok) {
        const result = await response.json()
        const lifeEvent = result.lifeEvent

        // Add to selected life events
        const lifeEventRef: LifeEventReference = {
          id: lifeEvent.id,
          name: lifeEvent.name,
          quality: newLifeEvent.quality
        }
        onLifeEventsChange([...selectedLifeEvents, lifeEventRef])

        // Reset form
        setNewLifeEvent({
          name: '',
          notes: '',
          quality: 3
        })

        setAddLifeEventOpen(false)
        setOpen(false)

        // Call parent callback if provided
        if (onAddLifeEvent) {
          onAddLifeEvent(lifeEvent)
        }

        // Refresh life events list
        if (onLifeEventsRefresh) {
          onLifeEventsRefresh()
        }
      }
    } catch (error) {
      console.error('Error adding life event:', error)
    }
  }

  const filteredLifeEvents = lifeEvents.filter(lifeEvent =>
    lifeEvent.name.toLowerCase().includes(searchValue.toLowerCase()) &&
    !selectedLifeEvents.find(sle => sle.id === lifeEvent.id)
  )

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between bg-purple-50 border-purple-200 hover:bg-purple-100"
          >
            <div className="flex items-center">
              <Calendar className="mr-2 h-4 w-4" />
              {t('social.selectLifeEvents')}
            </div>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-full p-0">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Search life events..."
              className="h-9"
              value={searchValue}
              onValueChange={setSearchValue}
            />
            <CommandList>
              <CommandEmpty>{t('social.noLifeEventsFound')}</CommandEmpty>
              <CommandGroup>
                {filteredLifeEvents.map((lifeEvent) => (
                  <div key={lifeEvent.id} className="space-y-2">
                    <CommandItem
                      value={lifeEvent.id}
                      onSelect={handleSelect}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          selectedLifeEvents.find(sle => sle.id === lifeEvent.id)
                            ? "opacity-100"
                            : "opacity-0"
                        )}
                      />
                      {lifeEvent.name}
                    </CommandItem >
                  </div >
                ))
}
<CommandItem
  value="add-new"
  onSelect={handleSelect}
  className="text-primary"
>
  <Plus className="mr-2 h-4 w-4" />
  {t('social.addNewLifeEvent')}...
</CommandItem>
              </CommandGroup >
            </CommandList >
          </Command >
        </PopoverContent >
      </Popover >

  {/* Selected Life Events Badges */ }
{
  selectedLifeEvents.length > 0 && (
    <div className="flex flex-wrap gap-2">
      {selectedLifeEvents.map((lifeEvent) => (
        <Badge
          key={lifeEvent.id}
          variant="secondary"
          className="flex items-center gap-1 bg-purple-100 text-purple-800 border-purple-200"
        >
          {lifeEvent.name}
          {lifeEvent.quality !== undefined && (
            <span className="text-xs">{lifeEvent.quality}/5</span>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-4 w-4 p-0 hover:bg-transparent"
            onClick={() => handleRemoveLifeEvent(lifeEvent.id)}
          >
            <X className="h-3 w-3" />
          </Button>
        </Badge>
      ))}
    </div>
  )
}

{/* Add New Life Event Dialog */ }
<Dialog open={addLifeEventOpen} onOpenChange={setAddLifeEventOpen}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>{t('social.addNewLifeEvent')}</DialogTitle>
    </DialogHeader>
    <div className="space-y-4">
      <Input
        placeholder={`${t('social.name')} *`}
        value={newLifeEvent.name}
        onChange={(e) => setNewLifeEvent({ ...newLifeEvent, name: e.target.value })}
      />
      <Textarea
        placeholder={t('social.notes')}
        value={newLifeEvent.notes}
        onChange={(e) => setNewLifeEvent({ ...newLifeEvent, notes: e.target.value })}
      />
      <div className="flex space-x-2">
        <Button onClick={handleAddNewLifeEvent} className="flex-1" disabled={!newLifeEvent.name.trim()}>
          {t('social.addLifeEvent')}
        </Button>
        <Button
          variant="outline"
          onClick={() => setAddLifeEventOpen(false)}
          className="flex-1"
        >
          {t('common.cancel')}
        </Button>
      </div>
    </div>
  </DialogContent>
</Dialog>
    </div >
  )
}
