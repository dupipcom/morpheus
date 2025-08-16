'use client'
import { type ChartConfig } from "@/components/ui/chart"
import { useState, useEffect, useContext } from 'react'
import { Area, CartesianGrid, Bar, AreaChart } from "recharts"
 
import { ChartContainer, ChartTooltipContent, ChartTooltip } from "@/components/ui/chart"
import { Button } from "@/components/ui/button"

import { EarningsTable } from '@/components/earningsTable'

import { getWeekNumber } from "@/app/helpers"

import { GlobalContext } from "@/lib/contexts"

const moodChartConfig = {
  moodAverage: {
    label: "Mood",
    color: "#2f2f8d",
  },
  gratitude: {
    label: "Gratitude",
    color: "#2f2f8d",
  },
  optimism: {
    label: "Optimism",
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

const productivityChartConfig = {
  moodAverage: {
    label: "Mood",
    color: "#2f2f8d",
  },
  progress: {
    label: "Progress",
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
    const { session, setGlobalContext, ...globalContext } = useContext(GlobalContext)

  const generateInsight = async (value, field) => {
    const response = await fetch('/api/v1/hint', { method: 'GET' }, {
  cache: 'force-cache',
  next: {
    revalidate: 86400,
    tags: ['hint'],
  },
})
    const json = await response.json()
    try {
      setInsight(JSON.parse(json.result))
    } catch (e) {
      setInsight(JSON.parse(JSON.stringify(json.result)))
    }
  }

  useEffect(() => {
    generateInsight()
  }, [])

  if (!session?.user) {
    return <div className="my-16 w-full flex align-center justify-center">
      <Button className="m-auto"><a  href="/login">Login</a></Button>
    </div>
  }

  const userDays = session?.user?.entries && session?.user?.entries[year]?.days ? Object.values(session?.user?.entries[year]?.days) : [];
  const plotData = userDays.reduce((acc, cur) => {
    acc = [
      ...acc,
      {
        date: cur.date,
        moodAverage: cur.moodAverage?.toLocaleString(),
        gratitude: cur.mood.gratitude?.toLocaleString(),
        optimism: cur.mood.optimism?.toLocaleString(),
        restedness: cur.mood.restedness?.toLocaleString(),
        tolerance: cur.mood.tolerance?.toLocaleString(),
        selfEsteem: cur.mood.selfEsteem?.toLocaleString(),
        trust: cur.mood.trust?.toLocaleString(),
        progress: cur.progress * 100 / 20,
        earnings: cur.earnings?.toLocaleString()
      }

    ]
    return acc
  }, []);

  return <div className="max-w-[1200px] w-full m-auto p-4 md:px-32 ">
      <p className="mt-0 mb-8">{insight?.yearAnalysis}</p>
      <h2 className="mb-8 mt-16 text-center scroll-m-20 text-lg font-semibold tracking-tight">Your mood.</h2>

      <ChartContainer config={moodChartConfig}>
        <AreaChart data={plotData}>
          <CartesianGrid vertical={true} horizontal={true} />
          <Area dataKey="moodAverage" stroke="#cffcdf
            " fill={"#cffcdf"} radius={4} fillOpacity={0.3}
          />
          <Area dataKey="gratitude"  stroke="#6565cc
            " fill="#6565cc
            " radius={4} fillOpacity={0.3}
          />
          <Area dataKey="optimism" stroke="#fbd2b0
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

      <h2 className="mb-8 mt-16 text-center scroll-m-20 text-lg font-semibold tracking-tight">Your productivity.</h2>

      <ChartContainer config={productivityChartConfig}>
        <AreaChart data={plotData}>
          <CartesianGrid vertical={true} horizontal={true} />
          <Area dataKey="moodAverage" stroke="#cffcdf
            " fill={"#cffcdf"} radius={4} fillOpacity={0.3}
          />
          <Area dataKey="progress"  stroke="#6565cc
            " fill="#6565cc
            " radius={4} fillOpacity={0.3}
          />
          <ChartTooltip content={<ChartTooltipContent />} />
        </AreaChart>
      </ChartContainer>

      <h2 className="mb-8 mt-16 text-center scroll-m-20 text-lg font-semibold tracking-tight">Your data.</h2>

      <EarningsTable data={plotData} />

    </div>
}