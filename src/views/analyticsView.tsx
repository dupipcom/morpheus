'use client'
import { type ChartConfig } from "@/components/ui/chart"
import { useState, useEffect } from 'react'
import { useSession, signIn, signOut } from "next-auth/react"
import { Area, CartesianGrid, Bar, AreaChart } from "recharts"
 
import { ChartContainer, ChartTooltipContent, ChartTooltip } from "@/components/ui/chart"

import { EarningsTable } from '@/components/earningsTable'

import { getWeekNumber } from "@/app/helpers"
 

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
  const fullDate = new Date()
  const date = fullDate.toISOString().split('T')[0]
  const year = Number(date.split('-')[0])
  const weekNumber = getWeekNumber(fullDate)[1]
  const [insight, setInsight] = useState({})
  const [relevantData, setRelevantData] = useState([])
  const { data: session, update } = useSession()

  const generateInsight = async (value, field) => {
    const response = await fetch('/api/v1/hint', { method: 'GET' }, {
  cache: 'force-cache',
  next: {
    revalidate: 86400,
    tags: ['test'],
  },
})
    const json = await response.json()
    setInsight(json.result)
  }

  useEffect(() => {
    generateInsight()
  }, [])


  return <div className="w-full m-auto p-8 md:px-32 ">
      <p className="mt-0 mb-8">{insight.yearAnalysis}</p>
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