"use client"

import * as React from "react"
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
import { ArrowUpDown, ChevronDown, MoreHorizontal } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useI18n } from "@/lib/contexts/i18n"


export type Payment = {
  earnings: number
  gratitude: number
  optimism: number
  restedness: number
  tolerance: number
  selfEsteem: number
  trust: number
  progress: number
  moodAverage: number
  date: string
}

const createColumns = (t: (key: string) => string): ColumnDef<Payment>[] => [
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
    accessorKey: "date",
    header: ({ column }) => {
      return (
        <Button
          className="!bg-[#6565cc] !text-[#f1cfff] hover:text-[#FACEFB]"
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          {t('earningsTable.day')}
          <ArrowUpDown />
        </Button>
      )
    },
    cell: ({ row }) => <div className="lowercase">{row.getValue("date")}</div>,
  },
  {
    accessorKey: "earnings",
    header: () => <div className="text-right">{t('earningsTable.earnings')}</div>,
    cell: ({ row }) => {
      const earnings = parseFloat(row.getValue("earnings"))

      // Format the earnings as a dollar earnings
      const formatted = new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
      }).format(earnings)

      return <div className="text-right font-medium">{formatted}</div>
    },
  },
  {
    accessorKey: "moodAverage",
    header: () => <div className="text-right">{t('earningsTable.moodAverage')}</div>,
    cell: ({ row }) => {
      const moodAverage = parseFloat(row.getValue("moodAverage"))

      return <div className="text-right font-medium">{moodAverage}</div>
    },
  },
  {
    accessorKey: "progress",
    header: () => <div className="text-right">{t('earningsTable.productivity')}</div>,
    cell: ({ row }) => {
      const progress = parseFloat(row.getValue("progress"))

      return <div className="text-right font-medium">{progress}</div>
    },
  },
  {
    accessorKey: "gratitude",
    header: () => <div className="text-right">{t('earningsTable.gratitude')}</div>,
    cell: ({ row }) => {
      const gratitude = parseFloat(row.getValue("gratitude"))

      return <div className="text-right font-medium">{gratitude}</div>
    },
  },
  {
    accessorKey: "optimism",
    header: () => <div className="text-right">{t('earningsTable.optimism')}</div>,
    cell: ({ row }) => {
      const optimism = parseFloat(row.getValue("optimism"))

      return <div className="text-right font-medium">{optimism}</div>
    },
  },
  {
    accessorKey: "restedness",
    header: () => <div className="text-right">{t('earningsTable.restedness')}</div>,
    cell: ({ row }) => {
      const restedness = parseFloat(row.getValue("restedness"))

      return <div className="text-right font-medium">{restedness}</div>
    },
  },
  {
    accessorKey: "tolerance",
    header: () => <div className="text-right">{t('earningsTable.tolerance')}</div>,
    cell: ({ row }) => {
      const tolerance = parseFloat(row.getValue("tolerance"))

      return <div className="text-right font-medium">{tolerance}</div>
    },
  },
  {
    accessorKey: "selfEsteem",
    header: () => <div className="text-right">{t('earningsTable.selfEsteem')}</div>,
    cell: ({ row }) => {
      const selfEsteem = parseFloat(row.getValue("selfEsteem"))

      return <div className="text-right font-medium">{selfEsteem}</div>
    },
  },
  {
    accessorKey: "trust",
    header: () => <div className="text-right">{t('earningsTable.trust')}</div>,
    cell: ({ row }) => {
      const trust = parseFloat(row.getValue("trust"))

      return <div className="text-right font-medium">{trust}</div>
    },
  },
  {
    id: "actions",
    enableHiding: false,
    cell: ({ row }) => {
      const payment = row.original

      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">Open menu</span>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>{t('earningsTable.actions')}</DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() => navigator.clipboard.writeText(payment.date)}
            >
              {t('earningsTable.closeDay')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>{t('earningsTable.editDay')}</DropdownMenuItem>
            <DropdownMenuItem className="text-[red]">{t('earningsTable.deleteDay')}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )
    },
  },
]

export function EarningsTable({ data = [] }) {
  const { t } = useI18n()
  const columns = createColumns(t)
  
  const [sorting, setSorting] = React.useState<SortingState>([
    {
      id: "date",
      desc: true, // Sort by most recent first
    },
  ])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    []
  )
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({})
  const [rowSelection, setRowSelection] = React.useState({})

  const table = useReactTable({
    data,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
    },
  })

  return (
    <div className="w-full">
      <div className="flex items-center py-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="ml-auto">
              {t('earningsTable.columns')} <ChevronDown />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {table
              .getAllColumns()
              .filter((column) => column.getCanHide())
              .map((column) => {
                return (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    className="capitalize"
                    checked={column.getIsVisible()}
                    onCheckedChange={(value) =>
                      column.toggleVisibility(!!value)
                    }
                  >
                    {column.id}
                  </DropdownMenuCheckboxItem>
                )
              })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="overflow-hidden rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
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
                  {t('earningsTable.noResults')}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-end space-x-2 py-4">
        <div className="text-muted-foreground flex-1 text-sm">
          {t('earningsTable.rowsSelected', { 
            selected: table.getFilteredSelectedRowModel().rows.length,
            total: table.getFilteredRowModel().rows.length 
          })}
        </div>
        <div className="space-x-2">
          <Button
            className="!bg-[#563769] text-[#f1cfff]"
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            {t('earningsTable.previous')}
          </Button>
          <Button
            className="!bg-[#563769] text-[#f1cfff]"
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            {t('earningsTable.next')}
          </Button>
        </div>
      </div>
    </div>
  )
}
