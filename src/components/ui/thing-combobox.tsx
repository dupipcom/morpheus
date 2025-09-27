"use client"
import * as React from "react"
import { Check, ChevronsUpDown, Plus, Package } from "lucide-react"
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

interface Thing {
  id: string
  name: string
  notes?: string
  interactionQuality?: number
}

interface ThingReference {
  id: string
  name: string
  interactionQuality?: number
}

interface ThingComboboxProps {
  things: Thing[]
  selectedThings: ThingReference[]
  onThingsChange: (things: ThingReference[]) => void
  onAddThing?: (thing: Thing) => void
  onThingsRefresh?: () => void
}

export function ThingCombobox({
  things,
  selectedThings,
  onThingsChange,
  onAddThing,
  onThingsRefresh
}: ThingComboboxProps) {
  const { t } = useI18n()
  const [open, setOpen] = React.useState(false)
  const [addThingOpen, setAddThingOpen] = React.useState(false)
  const [searchValue, setSearchValue] = React.useState("")

  const [newThing, setNewThing] = React.useState({
    name: '',
    notes: '',
    interactionQuality: 3
  })

  const [thingInteractionQualities, setThingInteractionQualities] = React.useState<{ [key: string]: number }>({})

  const handleSelect = (thingId: string) => {
    if (thingId === 'add-new') {
      setAddThingOpen(true)
      return
    }

    const thing = things.find(t => t.id === thingId)
    if (thing && !selectedThings.find(st => st.id === thing.id)) {
      const thingRef: ThingReference = {
        id: thing.id,
        name: thing.name,
        interactionQuality: thingInteractionQualities[thing.id] || thing.interactionQuality || 3
      }
      onThingsChange([...selectedThings, thingRef])
    }
    setOpen(false)
  }

  const handleRemoveThing = (thingId: string) => {
    onThingsChange(selectedThings.filter(t => t.id !== thingId))
  }

  const handleAddNewThing = async () => {
    if (!newThing.name.trim()) return

    try {
      const response = await fetch('/api/v1/things', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newThing),
      })

      if (response.ok) {
        const result = await response.json()
        const thing = result.thing

        // Add to selected things
        const thingRef: ThingReference = {
          id: thing.id,
          name: thing.name,
          interactionQuality: newThing.interactionQuality
        }
        onThingsChange([...selectedThings, thingRef])

        // Reset form
        setNewThing({
          name: '',
          notes: '',
          interactionQuality: 3
        })

        setAddThingOpen(false)
        setOpen(false)

        // Call parent callback if provided
        if (onAddThing) {
          onAddThing(thing)
        }

        // Refresh things list
        if (onThingsRefresh) {
          onThingsRefresh()
        }
      }
    } catch (error) {
      console.error('Error adding thing:', error)
    }
  }

  const filteredThings = things.filter(thing =>
    thing.name.toLowerCase().includes(searchValue.toLowerCase()) &&
    !selectedThings.find(st => st.id === thing.id)
  )

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between bg-blue-50 border-blue-200 hover:bg-blue-100"
          >
            <div className="flex items-center">
              <Package className="mr-2 h-4 w-4" />
              {t('social.selectThings')}
            </div>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-full p-0">
          <Command>
            <CommandInput
              placeholder="Search things..."
              className="h-9"
              value={searchValue}
              onValueChange={setSearchValue}
            />
            <CommandList>
              <CommandEmpty>{t('social.noThingsFound')}</CommandEmpty>
              <CommandGroup>
                {filteredThings.map((thing) => (
                  <div key={thing.id} className="space-y-2">
                    <CommandItem
                      value={thing.id}
                      onSelect={handleSelect}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          selectedThings.find(st => st.id === thing.id)
                            ? "opacity-100"
                            : "opacity-0"
                        )}
                      />
                      {thing.name}
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
  {t('social.addNewThing')}...
</CommandItem>
              </CommandGroup >
            </CommandList >
          </Command >
        </PopoverContent >
      </Popover >

  {/* Selected Things Badges */ }
{
  selectedThings.length > 0 && (
    <div className="flex flex-wrap gap-2">
      {selectedThings.map((thing) => (
        <Badge
          key={thing.id}
          variant="secondary"
          className="flex items-center gap-1 bg-blue-100 text-blue-800 border-blue-200"
        >
          {thing.name}
          {thing.interactionQuality && (
            <span className="text-xs">{thing.interactionQuality}/5</span>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-4 w-4 p-0 hover:bg-transparent"
            onClick={() => handleRemoveThing(thing.id)}
          >
            <X className="h-3 w-3" />
          </Button>
        </Badge>
      ))}
    </div>
  )
}

{/* Add New Thing Dialog */ }
<Dialog open={addThingOpen} onOpenChange={setAddThingOpen}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>{t('social.addNewThing')}</DialogTitle>
    </DialogHeader>
    <div className="space-y-4">
      <Input
        placeholder={`${t('social.name')} *`}
        value={newThing.name}
        onChange={(e) => setNewThing({ ...newThing, name: e.target.value })}
      />
      <Textarea
        placeholder={t('social.notes')}
        value={newThing.notes}
        onChange={(e) => setNewThing({ ...newThing, notes: e.target.value })}
      />
      <div className="flex space-x-2">
        <Button onClick={handleAddNewThing} className="flex-1" disabled={!newThing.name.trim()}>
          {t('social.addThing')}
        </Button>
        <Button
          variant="outline"
          onClick={() => setAddThingOpen(false)}
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
