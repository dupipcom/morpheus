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
} from "@/components/ui/dropdown-menu"

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
import { ArrowUpDown, ChevronDown, MoreHorizontal } from "lucide-react"
import { GlobalContext } from "@/lib/contexts"

export const SettingsView = ({ timeframe = "day" }) => {
  const fullDate = new Date()
  const date = fullDate.toISOString().split('T')[0]
  const year = Number(date.split('-')[0])
  const weekNumber = getWeekNumber(fullDate)[1]

  const dailyEntry = useRef({ times: 1, status: "Open", cadence: "daily" })
  const weeklyEntry = useRef({ times: 1, status: "Open", cadence: "weekly" })
  
  const { session, setGlobalContext, ...globalContext } = useContext(GlobalContext)

  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>(
    []
  )
  const [columnVisibility, setColumnVisibility] =
    useState<VisibilityState>({})
  const [rowSelection, setRowSelection] = useState({})

  const serverSettings = (session?.user?.settings) || {}

  const updateUser = async () => {
    const response = await fetch('/api/v1/user', { method: 'GET' })
    const updatedUser = await response.json()
    setGlobalContext({...globalContext, session: { ...session, user: updatedUser } })
  }

  const { data, mutate, error, isLoading } = useSWR(`/api/user`, updateUser)


  const handleSubmit = async (value, field) => {
    const response = await fetch('/api/v1/user', 
      { method: 'POST', 
        body: JSON.stringify({
          settings: {
            [field]: value,
          }
      }) 
    })
  }

  const handleDailyAdd = async () => {
    const payload = [...session?.user?.settings?.dailyTemplate, dailyEntry.current]
    await handleSubmit(payload , "dailyTemplate")
    mutate('/api/v1/user')
  }

  const handleWeeklyAdd = async () => {
    await handleSubmit([...session?.user?.settings?.weeklyTemplate, weeklyEntry.current], "weeklyTemplate")
    mutate('/api/v1/user')
  }

  const handleDailyDelete = async (e) => {
    await handleSubmit(session?.user?.settings?.dailyTemplate.filter((task) => task.name !== e), "dailyTemplate")
    mutate('/api/v1/user')
  }

  const handleWeeklyDelete = async (e) => {
    await handleSubmit(session?.user?.settings?.weeklyTemplate.filter((task) => task.name !== e), "weeklyTemplate")
    mutate('/api/v1/user')
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
            <DropdownMenuItem onClick={() => handleDailyDelete(name)} className="">Delete action</DropdownMenuItem>
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
            <DropdownMenuItem onClick={() => handleWeeklyDelete(name)} className="">Delete action</DropdownMenuItem>
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
    onRowSelectionChange: setRowSelection,
    initialState: {
      pagination: {
        pageSize: 50,
      },
    },
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
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
    onRowSelectionChange: setRowSelection,
    initialState: {
      pagination: {
        pageSize: 50,
      },
    },
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
    },
  })

  return <div className="max-w-[720px] m-auto p-4">
      <h3 className="my-8">Your daily actions:</h3>
      <div className="flex flex-col md:flex-row mb-8">
        <Input name="dailyTimes" placeholder="Type action name..." className="md:basis-2/3 md:mr-4 my-4 md:my-0" onBlur={(e) => {
          dailyEntry.current = { ...dailyEntry.current, name: e.currentTarget.value }
        }} />
        <Select className="mr-4" defaultValue="1" onValueChange={(e) => {
          dailyEntry.current = { ...dailyEntry.current, times: Number(e) }
        }} >
          <SelectTrigger className="w-full md:w-[120px] mb-4 mr-4">
            <SelectValue placeholder="# times" />
          </SelectTrigger>
          <SelectContent>
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
        <Select className="mr-4" onValueChange={(e) => {
          dailyEntry.current = { ...dailyEntry.current, area: e }
        }}>
          <SelectTrigger className="w-full md:w-[120px] mb-4 mr-4">
            <SelectValue placeholder="Area" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="self">Self</SelectItem>
            <SelectItem value="home">Home</SelectItem>
            <SelectItem value="social">Social</SelectItem>
          </SelectContent>
        </Select>
        <Select className="mr-4" onValueChange={(e) => {
          dailyEntry.current = { ...dailyEntry.current, categories: [e] }
        }}>
          <SelectTrigger className="w-full md:w-[120px] mb-4">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
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
        <Button onClick={handleDailyAdd} className="md:ml-4">Add</Button>
      </div>
      <Table>
          <TableHeader>
            {dailyTable?.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {dailyTable?.getRowModel().rows?.length ? (
              dailyTable?.getRowModel().rows.map((row) => (
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
                  colSpan={dayColumns.length}
                  className="h-24 text-center"
                >
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
     <h3 className="my-8 mt-16">Your weekly actions:</h3>
      <div className="flex flex-col md:flex-row mb-8">
        <Input name="dailyTimes" placeholder="Type action name..." className="md:basis-2/3 md:mr-4 my-4 md:my-0" onBlur={(e) => {
          weeklyEntry.current = { ...weeklyEntry.current, name: e.currentTarget.value }
        }} />
        <Select className="mr-4" defaultValue="1" onValueChange={(e) => {
          weeklyEntry.current = { ...weeklyEntry.current, times: Number(e) }
        }} >
          <SelectTrigger className="w-full md:w-[120px] mb-4 mr-4">
            <SelectValue placeholder="# times" />
          </SelectTrigger>
          <SelectContent>
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
        <Select className="mr-4" onValueChange={(e) => {
          weeklyEntry.current = { ...weeklyEntry.current, area: e }
        }}>
          <SelectTrigger className="w-full md:w-[120px] mb-4 mr-4">
            <SelectValue placeholder="Area" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="self">Self</SelectItem>
            <SelectItem value="home">Home</SelectItem>
            <SelectItem value="social">Social</SelectItem>
          </SelectContent>
        </Select>
        <Select className="mr-4" onValueChange={(e) => {
          weeklyEntry.current = { ...weeklyEntry.current, categories: [e] }
        }}>
          <SelectTrigger className="w-full md:w-[120px] mb-4">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
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
        <Button onClick={handleWeeklyAdd} className="md:ml-4">Add</Button>
      </div>
      <Table>
          <TableHeader>
            {weeklyTable?.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {weeklyTable?.getRowModel().rows?.length ? (
              weeklyTable?.getRowModel().rows.map((row) => (
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
                  colSpan={weekColumns.length}
                  className="h-24 text-center"
                >
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      <h3 className="mt-8">Month’s Recurring Income</h3>
      <Input defaultValue={serverSettings.monthsFixedIncome} onBlur={(e) => handleSubmit(e.currentTarget.value, "monthsFixedIncome")} />
      <h3 className="mt-8">Month’s Variable Income</h3>
      <Input defaultValue={serverSettings.monthsVariableIncome} onBlur={(e) => handleSubmit(e.currentTarget.value, "monthsVariableIncome")}/>
      <h3 className="mt-8">Fixed Need Costs</h3>
      <Input defaultValue={serverSettings.monthsNeedFixedExpenses} onBlur={(e) => handleSubmit(e.currentTarget.value, "monthsNeedFixedExpenses")}/>
      <h3 className="mt-8">Expected Need Utilities Average</h3>
      <Input defaultValue={serverSettings.monthsNeedVariableExpenses} onBlur={(e) => handleSubmit(e.currentTarget.value, "monthsNeedVariableExpenses")}/>
    </div>
}