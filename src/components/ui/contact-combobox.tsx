"use client"
import * as React from "react"
import { Check, ChevronsUpDown, Plus } from "lucide-react"
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

interface Contact {
  id: string
  name: string
  email?: string
  phone?: string
  notes?: string
  interactionQuality?: number
}

interface ContactReference {
  id: string
  name: string
  interactionQuality?: number
}

interface ContactComboboxProps {
  contacts: Contact[]
  selectedContacts: ContactReference[]
  onContactsChange: (contacts: ContactReference[]) => void
  onAddContact?: (contact: Contact) => void
  onContactsRefresh?: () => void
}

export function ContactCombobox({ 
  contacts, 
  selectedContacts, 
  onContactsChange,
  onAddContact,
  onContactsRefresh
}: ContactComboboxProps) {
  const { t } = useI18n()
  const [open, setOpen] = React.useState(false)
  const [addContactOpen, setAddContactOpen] = React.useState(false)
  const [searchValue, setSearchValue] = React.useState("")
  
  const [newContact, setNewContact] = React.useState({
    name: '',
    email: '',
    phone: '',
    notes: '',
    interactionQuality: 3
  })

  const [contactInteractionQualities, setContactInteractionQualities] = React.useState<{[key: string]: number}>({})

  const handleSelect = (contactId: string) => {
    if (contactId === 'add-new') {
      setAddContactOpen(true)
      return
    }

    const contact = contacts.find(c => c.id === contactId)
    if (contact && !selectedContacts.find(sc => sc.id === contact.id)) {
      const contactRef: ContactReference = {
        id: contact.id,
        name: contact.name,
        interactionQuality: contactInteractionQualities[contact.id] || contact.interactionQuality || 3
      }
      onContactsChange([...selectedContacts, contactRef])
    }
    setOpen(false)
  }

  const handleRemoveContact = (contactId: string) => {
    onContactsChange(selectedContacts.filter(c => c.id !== contactId))
  }

  const handleAddNewContact = async () => {
    if (!newContact.name.trim()) return

    try {
      const response = await fetch('/api/v1/contacts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newContact),
      })
      
      if (response.ok) {
        const result = await response.json()
        const contact = result.contact
        
        // Add to selected contacts
        const contactRef: ContactReference = {
          id: contact.id,
          name: contact.name,
          interactionQuality: newContact.interactionQuality
        }
        onContactsChange([...selectedContacts, contactRef])
        
        // Reset form
        setNewContact({
          name: '',
          email: '',
          phone: '',
          notes: '',
          interactionQuality: 3
        })
        
        setAddContactOpen(false)
        setOpen(false)
        
        // Call parent callback if provided
        if (onAddContact) {
          onAddContact(contact)
        }
        
        // Refresh contacts list
        if (onContactsRefresh) {
          onContactsRefresh()
        }
      }
    } catch (error) {
      console.error('Error adding contact:', error)
    }
  }

  const filteredContacts = contacts.filter(contact =>
    contact.name.toLowerCase().includes(searchValue.toLowerCase()) &&
    !selectedContacts.find(sc => sc.id === contact.id)
  )

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between"
          >
            {t('social.selectContacts')}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-full p-0">
          <Command>
            <CommandInput 
              placeholder="Search contacts..." 
              className="h-9"
              value={searchValue}
              onValueChange={setSearchValue}
            />
            <CommandList>
              <CommandEmpty>{t('social.noContactsFound')}</CommandEmpty>
              <CommandGroup>
                {filteredContacts.map((contact) => (
                  <div key={contact.id} className="space-y-2">
                    <CommandItem
                      value={contact.id}
                      onSelect={handleSelect}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          selectedContacts.find(sc => sc.id === contact.id) 
                            ? "opacity-100" 
                            : "opacity-0"
                        )}
                      />
                      {contact.name}
                      {contact.interactionQuality && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {contact.interactionQuality}/5
                        </span>
                      )}
                    </CommandItem>
                    <div className="px-2 pb-2">
                      <div className="text-xs text-muted-foreground mb-1">Interaction Quality</div>
                      <Slider
                        value={[contactInteractionQualities[contact.id] || contact.interactionQuality || 3]}
                        onValueChange={(value) => {
                          setContactInteractionQualities(prev => ({
                            ...prev,
                            [contact.id]: value[0]
                          }))
                        }}
                        max={5}
                        min={1}
                        step={1}
                        className="w-full"
                      />
                      <div className="text-xs text-muted-foreground mt-1">
                        {contactInteractionQualities[contact.id] || contact.interactionQuality || 3}/5
                      </div>
                    </div>
                  </div>
                ))}
                <CommandItem
                  value="add-new"
                  onSelect={handleSelect}
                  className="text-primary"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  {t('social.addNewContact')}...
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Selected Contacts Badges */}
      {selectedContacts.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedContacts.map((contact) => (
            <Badge
              key={contact.id}
              variant="secondary"
              className="flex items-center gap-1"
            >
              {contact.name}
                              {contact.interactionQuality && (
                  <span className="text-xs">{contact.interactionQuality}/5</span>
                )}
              <Button
                variant="ghost"
                size="sm"
                className="h-4 w-4 p-0 hover:bg-transparent"
                onClick={() => handleRemoveContact(contact.id)}
              >
                <X className="h-3 w-3" />
              </Button>
            </Badge>
          ))}
        </div>
      )}

      {/* Add New Contact Dialog */}
      <Dialog open={addContactOpen} onOpenChange={setAddContactOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('social.addNewContact')}</DialogTitle>
          </DialogHeader>
                      <div className="space-y-4">
              <Input
                placeholder={`${t('social.name')} *`}
                value={newContact.name}
                onChange={(e) => setNewContact({...newContact, name: e.target.value})}
              />
              <Input
                placeholder={t('social.email')}
                type="email"
                value={newContact.email}
                onChange={(e) => setNewContact({...newContact, email: e.target.value})}
              />
              <Input
                placeholder={t('social.phone')}
                value={newContact.phone}
                onChange={(e) => setNewContact({...newContact, phone: e.target.value})}
              />
              <Textarea
                placeholder={t('social.notes')}
                value={newContact.notes}
                onChange={(e) => setNewContact({...newContact, notes: e.target.value})}
              />
              <div>
                <label className="text-sm font-medium">{t('social.interactionQuality')}</label>
                              <Slider
                  value={[newContact.interactionQuality]}
                  onValueChange={(value) => setNewContact({...newContact, interactionQuality: value[0]})}
                  max={5}
                  min={1}
                  step={1}
                  className="w-full mt-2"
                />
                <div className="text-xs text-muted-foreground mt-1">
                  {newContact.interactionQuality}/5
                </div>
            </div>
                          <div className="flex space-x-2">
                <Button onClick={handleAddNewContact} className="flex-1" disabled={!newContact.name.trim()}>
                  {t('social.addContact')}
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => setAddContactOpen(false)}
                  className="flex-1"
                >
                  {t('common.cancel')}
                </Button>
              </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
} 