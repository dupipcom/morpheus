'use client'
import { useState, useRef, useContext, useEffect } from 'react'
import useSWR from 'swr'
import { Slider } from "@/components/ui/slider"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Plus, Star, Trash2, Edit } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table"

import { MoreHorizontal } from "lucide-react"
import { GlobalContext } from "@/lib/contexts"
import { useI18n } from "@/lib/contexts/i18n"
import { updateUser, isUserDataReady, useEnhancedLoadingState } from "@/lib/userUtils"
import { logger } from "@/lib/logger"
import { SettingsSkeleton } from "@/components/ui/skeleton-loader"

interface Contact {
  id: string
  name: string
  email?: string
  phone?: string
  notes?: string
  interactionQuality?: number
}

export const SocialView = () => {
  const { session, setGlobalContext, theme } = useContext(GlobalContext)
  const { t } = useI18n()
  
  const [contacts, setContacts] = useState<Contact[]>([])
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  
  const [newContact, setNewContact] = useState({
    name: '',
    email: '',
    phone: '',
    notes: '',
    interactionQuality: 3
  })

  const { data, mutate, error, isLoading } = useSWR(
    session?.user ? `/api/v1/contacts` : null,
    async () => {
      const response = await fetch('/api/v1/contacts')
      if (response.ok) {
        const data = await response.json()
        setContacts(data.contacts || [])
        return data
      }
      return { contacts: [] }
    }
  )

  // Refresh contacts when data changes
  useEffect(() => {
    if (data?.contacts) {
      setContacts(data.contacts)
    }
  }, [data])

  const handleAddContact = async () => {
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
        // Reset form
        setNewContact({
          name: '',
          email: '',
          phone: '',
          notes: '',
          interactionQuality: 3
        })
        // Refresh contacts list
        mutate()
      }
    } catch (error) {
      logger('add_contact_error', `Error adding contact: ${error}`)
    }
  }

  const handleUpdateContact = async (contact: Contact) => {
    try {
      const response = await fetch(`/api/v1/contacts/${contact.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(contact),
      })
      
      if (response.ok) {
        setSelectedContact(null)
        setIsEditing(false)
        mutate()
      }
    } catch (error) {
      logger('update_contact_error', `Error updating contact: ${error}`)
    }
  }

  const handleDeleteContact = async (contactId: string) => {
    try {
      const response = await fetch(`/api/v1/contacts/${contactId}`, {
        method: 'DELETE',
      })
      
      if (response.ok) {
        mutate()
      }
    } catch (error) {
      logger('delete_contact_error', `Error deleting contact: ${error}`)
    }
  }

  const handleInteractionQualityChange = async (contactId: string, quality: number) => {
    const updatedContact = contacts.find(c => c.id === contactId)
    if (updatedContact) {
      updatedContact.interactionQuality = quality
      await handleUpdateContact(updatedContact)
    }
  }

  const columns: ColumnDef<Contact>[] = [
    {
      accessorKey: "name",
      header: t('social.name'),
      cell: ({ row }) => (
        <div className="flex items-center space-x-2">
          <div className="font-medium">{row.getValue("name")}</div>
        </div>
      ),
    },
    {
      accessorKey: "email",
      header: t('social.email'),
      cell: ({ row }) => <div>{row.getValue("email") || '-'}</div>,
    },
    {
      accessorKey: "phone",
      header: t('social.phone'),
      cell: ({ row }) => <div>{row.getValue("phone") || '-'}</div>,
    },
    {
      accessorKey: "notes",
      header: t('social.notes'),
      cell: ({ row }) => <div className="max-w-[200px] truncate">{row.getValue("notes") || '-'}</div>,
    },

    {
      id: "actions",
      enableHiding: false,
      cell: ({ row }) => {
        const contact = row.original

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <span className="sr-only">Open menu</span>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => {
                setSelectedContact(contact)
                setIsEditing(true)
              }}>
                <Edit className="mr-2 h-4 w-4" />
                {t('social.editContact')}
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => handleDeleteContact(contact.id)}
                className="text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {t('social.deleteContact')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    },
  ]

  const table = useReactTable({
    data: contacts,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  // Use enhanced loading state to prevent flashing
  const isDataLoading = useEnhancedLoadingState(isLoading, session)

  if (isDataLoading) {
    return <SettingsSkeleton />
  }

  return (
    <div className="max-w-[1200px] m-auto p-4">
      <h2 className="text-2xl font-bold mb-8">{t('social.title')}</h2>
      
      {/* Add Contact Form */}
      <div className="mb-8 p-6 border rounded-lg">
        <h3 className="text-lg font-semibold mb-4">{t('social.addNewContact')}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Input
            placeholder={t('social.name')}
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
          <Button onClick={handleAddContact} disabled={!newContact.name}>
            <Plus className="mr-2 h-4 w-4" />
            {t('social.addContact')}
          </Button>
        </div>
        <div className="mt-4">
          <Textarea
            placeholder={t('social.notes')}
            value={newContact.notes}
            onChange={(e) => setNewContact({...newContact, notes: e.target.value})}
            className="w-full"
          />
        </div>
      </div>

      {/* Contacts Badge List */}
      <div className="mb-8">
        <h3 className="text-lg font-semibold mb-4">{t('social.quickAccess')}</h3>
        <div className="flex flex-wrap gap-2">
          {contacts.map((contact) => (
            <Badge
              key={contact.id}
              variant="outline"
              className="cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors"
              onClick={() => {
                setSelectedContact(contact)
                setIsEditing(true)
              }}
            >
              {contact.name}
            </Badge>
          ))}
        </div>
      </div>

      {/* Edit Contact Modal */}
      {selectedContact && isEditing && (
        <div className="fixed inset-0 bg-accent/70 flex items-center justify-center z-1002">
          <div className="bg-background p-6 rounded-lg max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">{t('social.editContact')}</h3>
                          <div className="space-y-4">
                <Input
                  placeholder={t('social.name')}
                  value={selectedContact.name}
                  onChange={(e) => setSelectedContact({...selectedContact, name: e.target.value})}
                />
                <Input
                  placeholder={t('social.email')}
                  type="email"
                  value={selectedContact.email || ''}
                  onChange={(e) => setSelectedContact({...selectedContact, email: e.target.value})}
                />
                <Input
                  placeholder={t('social.phone')}
                  value={selectedContact.phone || ''}
                  onChange={(e) => setSelectedContact({...selectedContact, phone: e.target.value})}
                />
                <Textarea
                  placeholder={t('social.notes')}
                  value={selectedContact.notes || ''}
                  onChange={(e) => setSelectedContact({...selectedContact, notes: e.target.value})}
                />
              <div className="flex space-x-2">
                <Button onClick={() => handleUpdateContact(selectedContact)} className="flex-1">
                  {t('common.save')}
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setSelectedContact(null)
                    setIsEditing(false)
                  }}
                  className="flex-1"
                >
                  {t('common.cancel')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Contacts Table */}
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  {t('social.noContactsFound')}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
} 