'use client'
import { useState, useRef, useContext, useEffect } from 'react'
import useSWR from 'swr'
import { Slider } from "@/components/ui/slider"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"

import { getWeekNumber } from "@/app/helpers"

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
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdownMenu"

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

import {
  ColumnDef,
  ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
  VisibilityState,
} from "@tanstack/react-table"

import { WEEKLY_ACTIONS, DAILY_ACTIONS } from "@/app/constants"
import { ArrowUpDown, ChevronDown, MoreHorizontal, Edit, X } from "lucide-react"
import { GlobalContext } from "@/lib/contexts"
import { updateUser, handleSettingsSubmit, isUserDataReady, useEnhancedLoadingState, useUserData } from "@/lib/userUtils"
import { logger } from "@/lib/logger"
import { SettingsSkeleton } from "@/components/ui/skeletonLoader"
import { useI18n } from "@/lib/contexts/i18n"

export const SettingsView = ({ timeframe = "day" }) => {
  const fullDate = new Date()
  const date = fullDate.toISOString().split('T')[0]
  const year = Number(date.split('-')[0])
  const weekNumber = getWeekNumber(fullDate)[1]

  const dailyEntry = useRef({ times: 1, status: "Open", cadence: "daily" })
  const weeklyEntry = useRef({ times: 1, status: "Open", cadence: "weekly" })
  
  const { session, setGlobalContext, theme } = useContext(GlobalContext)
  const { t } = useI18n()

  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>(
    []
  )
  const [columnVisibility, setColumnVisibility] =
    useState<VisibilityState>({})
  const [dailyRowSelection, setDailyRowSelection] = useState({})
  const [weeklyRowSelection, setWeeklyRowSelection] = useState({})
  
  // Edit state management
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [editingAction, setEditingAction] = useState(null)
  const [editFormData, setEditFormData] = useState({
    name: '',
    times: 1,
    area: '',
    categories: []
  })

  // Handle escape key to close modal
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isEditOpen) {
        setIsEditOpen(false)
      }
    }
    
    if (isEditOpen) {
      document.addEventListener('keydown', handleEscape)
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden'
    }
    
    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = 'unset'
    }
  }, [isEditOpen])

  const serverSettings = (session?.user?.settings) || {}

  const { mutate, isLoading, refreshUser } = useUserData()

  // Currency mapping: code -> symbol
  const currencyMap: Record<string, { symbol: string; name: string }> = {
    USD: { symbol: '$', name: 'US Dollar' },
    EUR: { symbol: '€', name: 'Euro' },
    JPY: { symbol: '¥', name: 'Japanese Yen' },
    GBP: { symbol: '£', name: 'British Pound' },
    CNY: { symbol: '¥', name: 'Chinese Yuan' },
    AUD: { symbol: 'A$', name: 'Australian Dollar' },
    CAD: { symbol: 'C$', name: 'Canadian Dollar' },
    CHF: { symbol: 'CHF', name: 'Swiss Franc' },
    HKD: { symbol: 'HK$', name: 'Hong Kong Dollar' },
    BRL: { symbol: 'R$', name: 'Brazilian Real' },
    SEK: { symbol: 'kr', name: 'Swedish Krona' },
    NZD: { symbol: 'NZ$', name: 'New Zealand Dollar' },
    MXN: { symbol: 'MX$', name: 'Mexican Peso' },
    SGD: { symbol: 'S$', name: 'Singapore Dollar' },
    NOK: { symbol: 'kr', name: 'Norwegian Krone' },
    KRW: { symbol: '₩', name: 'South Korean Won' },
    TRY: { symbol: '₺', name: 'Turkish Lira' },
    INR: { symbol: '₹', name: 'Indian Rupee' },
    RUB: { symbol: '₽', name: 'Russian Ruble' },
    ZAR: { symbol: 'R', name: 'South African Rand' },
    PLN: { symbol: 'zł', name: 'Polish Zloty' },
    CZK: { symbol: 'Kč', name: 'Czech Koruna' },
    HUF: { symbol: 'Ft', name: 'Hungarian Forint' },
    RON: { symbol: 'lei', name: 'Romanian Leu' },
    BGN: { symbol: 'лв', name: 'Bulgarian Lev' },
    DKK: { symbol: 'kr', name: 'Danish Krone' },
    ISK: { symbol: 'kr', name: 'Icelandic Krona' },
    RSD: { symbol: 'дин', name: 'Serbian Dinar' },
    BAM: { symbol: 'КМ', name: 'Bosnia-Herzegovina Convertible Mark' },
    MKD: { symbol: 'ден', name: 'Macedonian Denar' },
    ALL: { symbol: 'L', name: 'Albanian Lek' },
    MDL: { symbol: 'L', name: 'Moldovan Leu' },
    UAH: { symbol: '₴', name: 'Ukrainian Hryvnia' },
    BYN: { symbol: 'Br', name: 'Belarusian Ruble' },
    GEL: { symbol: '₾', name: 'Georgian Lari' },
    AMD: { symbol: '֏', name: 'Armenian Dram' },
    AZN: { symbol: '₼', name: 'Azerbaijani Manat' },
  }

  const currentCurrency = serverSettings.currency?.code || 'USD'
  const currencyOptions = Object.keys(currencyMap).sort()

  const handleCurrencyChange = async (currencyCode: string) => {
    const currencyInfo = currencyMap[currencyCode]
    if (currencyInfo) {
      const currencyValue = {
        code: currencyCode,
        symbol: currencyInfo.symbol
      }
      await handleSettingsSubmit(currencyValue, "currency")
      await refreshUser()
    }
  }




  const handleDailyAdd = async () => {
    const payload = [...session?.user?.settings?.dailyTemplate, dailyEntry.current]
    await handleSettingsSubmit(payload, "dailyTemplate")
    await refreshUser()
  }

  const handleWeeklyAdd = async () => {
    await handleSettingsSubmit([...session?.user?.settings?.weeklyTemplate, weeklyEntry.current], "weeklyTemplate")
    await refreshUser()
  }

  const handleDailyDelete = async (e) => {
    await handleSettingsSubmit(session?.user?.settings?.dailyTemplate.filter((task) => task.name !== e), "dailyTemplate")
    await refreshUser()
  }

  const handleWeeklyDelete = async (e) => {
    await handleSettingsSubmit(session?.user?.settings?.weeklyTemplate.filter((task) => task.name !== e), "weeklyTemplate")
    await refreshUser()
  }

  const handleDailyBulkDelete = async () => {
    try {
      const selectedRows = dailyTable.getFilteredSelectedRowModel().rows
      if (selectedRows.length === 0) return
      
      const selectedNames = selectedRows.map(row => row.getValue("name"))
      const filteredTemplate = session?.user?.settings?.dailyTemplate.filter((task) => !selectedNames.includes(task.name))
      await handleSettingsSubmit(filteredTemplate, "dailyTemplate")
      setDailyRowSelection({})
      await refreshUser()
    } catch (error) {
      logger('delete_daily_actions_error', `Error deleting daily actions: ${error}`)
    }
  }

  const handleWeeklyBulkDelete = async () => {
    try {
      const selectedRows = weeklyTable.getFilteredSelectedRowModel().rows
      if (selectedRows.length === 0) return
      
      const selectedNames = selectedRows.map(row => row.getValue("name"))
      const filteredTemplate = session?.user?.settings?.weeklyTemplate.filter((task) => !selectedNames.includes(task.name))
      await handleSettingsSubmit(filteredTemplate, "weeklyTemplate")
      setWeeklyRowSelection({})
      await refreshUser()
    } catch (error) {
      logger('delete_weekly_actions_error', `Error deleting weekly actions: ${error}`)
    }
  }

  const handleEditAction = (action, templateType) => {
    setEditingAction({ ...action, templateType })
    setEditFormData({
      name: action.name,
      times: action.times,
      area: action.area,
      categories: action.categories || []
    })
    setIsEditOpen(true)
  }

  const handleEditSubmit = async () => {
    try {
      const { templateType, ...originalAction } = editingAction
      const updatedAction = {
        ...originalAction,
        name: editFormData.name,
        times: editFormData.times,
        area: editFormData.area,
        categories: editFormData.categories
      }

      const templateKey = templateType === 'daily' ? 'dailyTemplate' : 'weeklyTemplate'
      const currentTemplate = session?.user?.settings?.[templateKey] || []
      const updatedTemplate = currentTemplate.map(action => 
        action.name === originalAction.name ? updatedAction : action
      )

      await handleSettingsSubmit(updatedTemplate, templateKey)
      await refreshUser()
      setIsEditOpen(false)
      setEditingAction(null)
    } catch (error) {
      logger('edit_action_error', `Error editing action: ${error}`)
    }
  }

  const dayColumns: ColumnDef<Payment>[] = [
  {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && "indeterminate")
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "name",
    header: ({ column }) => {
      return (
        <div>
          Action
        </div>
      )
    },
    cell: ({ row }) => <div>{row.getValue("name")}</div>,
  },
  {
    accessorKey: "times",
    header: () => <div className="text-right"># of times</div>,
    cell: ({ row }) => {
      const times = parseFloat(row.getValue("times"))

      return <div className="text-right font-medium">{times}x</div>
    },
  },
  {
    id: "actions",
    enableHiding: false,
    cell: ({ row }) => {
      const payment = row.original
      const name = row.getValue("name")

      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">Open menu</span>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleEditAction(payment, 'daily')}>
              {t('settings.editAction')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleDailyDelete(name)} className="text-destructive">
              {t('settings.deleteAction')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )
    },
  },
]

  const weekColumns: ColumnDef<Payment>[] = [
  {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && "indeterminate")
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "name",
    header: ({ column }) => {
      return (
        <div>
          Action
        </div>
      )
    },
    cell: ({ row }) => <div>{row.getValue("name")}</div>,
  },
  {
    accessorKey: "times",
    header: () => <div className="text-right"># of times</div>,
    cell: ({ row }) => {
      const times = parseFloat(row.getValue("times"))

      return <div className="text-right font-medium">{times}x</div>
    },
  },
  {
    id: "actions",
    enableHiding: false,
    cell: ({ row }) => {
      const payment = row.original
      const name = row.getValue("name")

      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">Open menu</span>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleEditAction(payment, 'weekly')}>
              <Edit className="mr-2 h-4 w-4" />
              {t('settings.editAction')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleWeeklyDelete(name)} className="text-destructive">
              {t('settings.deleteAction')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )
    },
  },
]


  const dailyTable = useReactTable({
    data: session?.user?.settings?.dailyTemplate || [],
    columns: dayColumns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setDailyRowSelection,
    initialState: {
      pagination: {
        pageSize: 50,
      },
    },
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection: dailyRowSelection,
    },
  })

  const weeklyTable = useReactTable({
    data: session?.user?.settings?.weeklyTemplate || [],
    columns: weekColumns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setWeeklyRowSelection,
    initialState: {
      pagination: {
        pageSize: 50,
      },
    },
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection: weeklyRowSelection,
    },
  })

  // Use enhanced loading state to prevent flashing
  const isDataLoading = useEnhancedLoadingState(isLoading, session)

  if (isDataLoading) {
    return <SettingsSkeleton />
  }

  return <div className="max-w-[720px] m-auto p-4">
      <h3 className="mt-8">{t('settings.currency') || 'Currency'}</h3>
      <Select value={currentCurrency} onValueChange={handleCurrencyChange}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder={t('settings.selectCurrency') || 'Select currency'} />
        </SelectTrigger>
        <SelectContent className="z-[10000]">
          {currencyOptions.map((code) => {
            const currency = currencyMap[code]
            return (
              <SelectItem key={code} value={code}>
                {currency.symbol} {code} - {currency.name}
              </SelectItem>
            )
          })}
        </SelectContent>
      </Select>
      
      {/* Edit Action Popover */}
      {isEditOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-[9998] flex items-center justify-center p-4"
          onClick={() => setIsEditOpen(false)}
        >
          <div 
            className="bg-background border rounded-lg shadow-lg w-full max-w-md z-[9999]"
            onClick={(e) => e.stopPropagation()}
          >
          <div className="space-y-4 p-4">
            <div className="flex justify-between items-center">
              <h4 className="font-medium">{t('settings.editAction')}</h4>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setIsEditOpen(false)}
                className="h-8 w-8 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-2">
              <Input
                placeholder={t('settings.actionName')}
                value={editFormData.name}
                onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('settings.numberOfTimes')}</label>
              <Select
                value={editFormData.times.toString()}
                onValueChange={(value) => setEditFormData({ ...editFormData, times: Number(value) })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-[10000]">
                  <SelectItem value="1">1</SelectItem>
                  <SelectItem value="2">2</SelectItem>
                  <SelectItem value="3">3</SelectItem>
                  <SelectItem value="4">4</SelectItem>
                  <SelectItem value="5">5</SelectItem>
                  <SelectItem value="6">6</SelectItem>
                  <SelectItem value="7">7</SelectItem>
                  <SelectItem value="8">8</SelectItem>
                  <SelectItem value="9">9</SelectItem>
                  <SelectItem value="10">10</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">{t('settings.area')}</label>
              <Select
                value={editFormData.area}
                onValueChange={(value) => setEditFormData({ ...editFormData, area: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('settings.area')} />
                </SelectTrigger>
                <SelectContent className="z-[10000]">
                  <SelectItem value="self">Self</SelectItem>
                  <SelectItem value="home">Home</SelectItem>
                  <SelectItem value="social">Social</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">{t('settings.category')}</label>
              <Select
                value={editFormData.categories[0] || ''}
                onValueChange={(value) => setEditFormData({ ...editFormData, categories: [value] })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('settings.category')} />
                </SelectTrigger>
                <SelectContent className="z-[10000]">
                  <SelectItem value="body">Body</SelectItem>
                  <SelectItem value="spirituality">Spirituality</SelectItem>
                  <SelectItem value="fun">Fun</SelectItem>
                  <SelectItem value="extra">Extra</SelectItem>
                  <SelectItem value="clean">Clean</SelectItem>
                  <SelectItem value="affection">Affection</SelectItem>
                  <SelectItem value="growth">Growth</SelectItem>
                  <SelectItem value="work">Work</SelectItem>
                  <SelectItem value="maintenance">Maintenance</SelectItem>
                  <SelectItem value="community">Community</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-end space-x-2 p-4">
              <Button variant="outline" onClick={() => setIsEditOpen(false)}>
                {t('settings.cancel')}
              </Button>
              <Button onClick={handleEditSubmit}>
                {t('settings.save')}
              </Button>
            </div>
          </div>
          </div>
        </div>
      )}
    </div>
}