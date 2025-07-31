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
  moodAverage: {
    label: "Mood",
    color: "#2f2f8d",
  },
  gratitude: {
    label: "Gratitude",
    color: "#2f2f8d",
  },
  acceptance: {
    label: "Acceptance",
    color: "#2f2f8d",
  },
  restedness: {
    label: "Restedness",
    color: "#2f2f8d",
  },
  tolerance: {
    label: "Tolerance",
    color: "#2f2f8d",
  },
  selfEsteem: {
    label: "Self Esteem",
    color: "#2f2f8d",
  },
  trust: {
    label: "Trust",
    color: "#2f2f8d",
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

  const userDays = session?.user?.entries[year]?.days ? Object.values(session?.user?.entries[year]?.days) : [];
  const plotData = userDays.reduce((acc, cur) => {
    acc = [
      ...acc,
      {
        date: cur.date,
        moodAverage: cur.moodAverage,
        gratitude: cur.mood.gratitude,
        acceptance: cur.mood.acceptance,
        restedness: cur.mood.restedness,
        tolerance: cur.mood.tolerance,
        selfEsteem: cur.mood.selfEsteem,
        trust: cur.mood.trust
      }

    ]
    return acc
  }, []);

  console.log({ userDays, plotData })
  return <div className="w-full m-auto p-8 md:px-32 ">
      <p className="mt-0 mb-8">{insight.yearAnalysis}</p>
      <ChartContainer config={chartConfig}>
        <AreaChart data={plotData}>
          <CartesianGrid vertical={true} horizontal={true} />
          <Area dataKey="moodAverage" stroke="#cffcdf
            " fill={"#cffcdf"} radius={4} fillOpacity={0.3}
          />
          <Area dataKey="gratitude"  stroke="#6565cc
            " fill="#6565cc
            " radius={4} fillOpacity={0.3}
          />
          <Area dataKey="acceptance" stroke="#fbd2b0
            " fill={"#fbd2b0"} radius={4} fillOpacity={0.3}
          />
          <Area dataKey="restedness"  stroke="#fcedd5
            " fill="#fcedd5
            " radius={4} fillOpacity={0.3}
          />
          <Area dataKey="tolerance" stroke="#FACEFB
            " fill={"#FACEFB"} radius={4} fillOpacity={0.3}
          />
          <Area dataKey="selfEsteem"  stroke="#2f2f8d
            " fill="#2f2f8d
            " radius={4} fillOpacity={0.3}
          />
          <Area dataKey="trust" stroke="#f7bfa5
            " fill={"#f7bfa5"} radius={4} fillOpacity={0.3}
          />
          <ChartTooltip content={<ChartTooltipContent />} />
        </AreaChart>
      </ChartContainer>
      <EarningsTable />
    </div>
}