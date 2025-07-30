'use client'
import { type ChartConfig } from "@/components/ui/chart"
import { Area, CartesianGrid, Bar, AreaChart } from "recharts"
 
import { ChartContainer, ChartTooltipContent, ChartTooltip } from "@/components/ui/chart"

import { EarningsTable } from '@/components/earningsTable'
 

 const chartData = [
  { month: "January", mood: 186, productivity: 80 },
  { month: "February", mood: 305, productivity: 200 },
  { month: "March", mood: 237, productivity: 120 },
  { month: "April", mood: 73, productivity: 190 },
  { month: "May", mood: 209, productivity: 130 },
  { month: "June", mood: 214, productivity: 140 },
]

const chartConfig = {
  mood: {
    label: "Mood",
    color: "#2f2f8d",
  },
  productivity: {
    label: "Productivity",
    color: "#6565cc",
  },
} satisfies ChartConfig

export const AnalyticsView = ({ timeframe = "day" }) => {
  return <div className="w-full m-auto">
      <ChartContainer config={chartConfig}>
        <AreaChart data={chartData}>
          <CartesianGrid vertical={true} horizontal={true} />
          <Area dataKey="mood" fill="var(--color-desktop)" radius={4} fillOpacity={0.3}
          />
          <Area dataKey="productivity" fill="var(--color-mobile)" radius={4} fillOpacity={0.3}
          />
          <ChartTooltip content={<ChartTooltipContent />} />
        </AreaChart>
      </ChartContainer>
      <EarningsTable />
    </div>
}