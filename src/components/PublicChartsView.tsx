'use client'

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ChartContainer, ChartTooltipContent, ChartTooltip, ChartLegendContent, ChartLegend } from "@/components/ui/chart"
import { Area, CartesianGrid, AreaChart, XAxis } from "recharts"
import { type ChartConfig } from "@/components/ui/chart"

interface PublicChartsViewProps {
  chartsData: {
    moodCharts?: {
      weeksData: Array<{
        week: number
        moodAverage: number
        gratitude: number
        optimism: number
        restedness: number
        tolerance: number
        selfEsteem: number
        trust: number
      }>
    }
    productivityCharts?: {
      weeksData: Array<{
        week: number
        progress: number
        moodAverage: number
      }>
    }
    earningsCharts?: {
      weeksData: Array<{
        week: number
        earnings: number
        balance: number
        moodAverage: number
      }>
    }
  }
}

const moodChartConfig = {
  moodAverage: {
    label: "Mood Average (%)",
    color: "#2f2f8d",
  },
  gratitude: {
    label: "Gratitude (%)",
    color: "#2f2f8d",
  },
  optimism: {
    label: "Optimism (%)",
    color: "#2f2f8d",
  },
  restedness: {
    label: "Restedness (%)",
    color: "#2f2f8d",
  },
  tolerance: {
    label: "Tolerance (%)",
    color: "#2f2f8d",
  },
  selfEsteem: {
    label: "Self Esteem (%)",
    color: "#2f2f8d",
  },
  trust: {
    label: "Trust (%)",
    color: "#2f2f8d",
  },
} satisfies ChartConfig

const productivityChartConfig = {
  moodAverage: {
    label: "Mood Average (%)",
    color: "#2f2f8d",
  },
  progress: {
    label: "Progress (%)",
    color: "#10b981",
  },
} satisfies ChartConfig

const earningsChartConfig = {
  earnings: {
    label: "Earnings (%)",
    color: "#10b981",
  },
  balance: {
    label: "Balance (%)",
    color: "#3b82f6",
  },
  moodAverage: {
    label: "Mood Average (%)",
    color: "#2f2f8d",
  },
} satisfies ChartConfig

export function PublicChartsView({ chartsData }: PublicChartsViewProps) {
  if (!chartsData) {
    return (
      <div className="text-center text-muted-foreground">
        <p>No public charts data available.</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Mood Charts */}
      {chartsData.moodCharts && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold">Mood Tracking</h3>
              <p className="text-sm text-muted-foreground">Values scaled to percentages for privacy</p>
            </div>
            <Badge variant="outline">Mood Charts</Badge>
          </div>
          
          <ChartContainer config={moodChartConfig}>
            <AreaChart data={chartsData.moodCharts.weeksData} accessibilityLayer>
              <CartesianGrid vertical={true} horizontal={true} />
              <Area 
                stackId="2" 
                type="monotone" 
                dataKey="moodAverage" 
                stroke="#cffcdf" 
                fill="#cffcdf" 
                radius={4} 
                fillOpacity={0.4} 
              />
              <Area 
                stackId="1" 
                type="monotone" 
                dataKey="gratitude" 
                stroke="#6565cc" 
                fill="#6565cc" 
                radius={4} 
                fillOpacity={0.4} 
              />
              <Area 
                stackId="1" 
                type="monotone" 
                dataKey="optimism" 
                stroke="#fbd2b0" 
                fill="#fbd2b0" 
                radius={4} 
                fillOpacity={0.4} 
              />
              <Area 
                stackId="1" 
                type="monotone" 
                dataKey="restedness" 
                stroke="#fcedd5" 
                fill="#fcedd5" 
                radius={4} 
                fillOpacity={0.4} 
              />
              <Area 
                stackId="1" 
                type="monotone" 
                dataKey="tolerance" 
                stroke="#FACEFB" 
                fill="#FACEFB" 
                radius={4} 
                fillOpacity={0.4} 
              />
              <Area 
                stackId="1" 
                type="monotone" 
                dataKey="selfEsteem" 
                stroke="#2f2f8d" 
                fill="#2f2f8d" 
                radius={4} 
                fillOpacity={0.4} 
              />
              <Area 
                stackId="1" 
                type="monotone" 
                dataKey="trust" 
                stroke="#f7bfa5" 
                fill="#f7bfa5" 
                radius={4} 
                fillOpacity={0.4} 
              />
              <XAxis
                dataKey="week"
                tickLine={false}
                tickMargin={5}
                axisLine={true}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <ChartLegend verticalAlign="top" content={<ChartLegendContent payload={[]} />} />
            </AreaChart>
          </ChartContainer>
        </div>
      )}

      {/* Productivity Charts */}
      {chartsData.productivityCharts && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold">Productivity</h3>
              <p className="text-sm text-muted-foreground">Values scaled to percentages for privacy</p>
            </div>
            <Badge variant="outline">Productivity Charts</Badge>
          </div>
          
          <ChartContainer config={productivityChartConfig}>
            <AreaChart data={chartsData.productivityCharts.weeksData} accessibilityLayer>
              <CartesianGrid vertical={true} horizontal={true} />
              <Area 
                stackId="1" 
                type="monotone" 
                dataKey="moodAverage" 
                stroke="#2f2f8d" 
                fill="#2f2f8d" 
                radius={4} 
                fillOpacity={0.4} 
              />
              <Area 
                stackId="2" 
                type="monotone" 
                dataKey="progress" 
                stroke="#10b981" 
                fill="#10b981" 
                radius={4} 
                fillOpacity={0.4} 
              />
              <XAxis
                dataKey="week"
                tickLine={false}
                tickMargin={5}
                axisLine={true}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <ChartLegend verticalAlign="top" content={<ChartLegendContent payload={[]} />} />
            </AreaChart>
          </ChartContainer>
        </div>
      )}

      {/* Earnings Charts */}
      {chartsData.earningsCharts && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold">Earnings</h3>
              <p className="text-sm text-muted-foreground">Values scaled to percentages for privacy</p>
            </div>
            <Badge variant="outline">Earnings Charts</Badge>
          </div>
          
          <ChartContainer config={earningsChartConfig}>
            <AreaChart data={chartsData.earningsCharts.weeksData} accessibilityLayer>
              <CartesianGrid vertical={true} horizontal={true} />
              <Area 
                stackId="1" 
                type="monotone" 
                dataKey="earnings" 
                stroke="#10b981" 
                fill="#10b981" 
                radius={4} 
                fillOpacity={0.4} 
              />
              <Area 
                stackId="2" 
                type="monotone" 
                dataKey="balance" 
                stroke="#3b82f6" 
                fill="#3b82f6" 
                radius={4} 
                fillOpacity={0.4} 
              />
              <Area 
                stackId="3" 
                type="monotone" 
                dataKey="moodAverage" 
                stroke="#2f2f8d" 
                fill="#2f2f8d" 
                radius={4} 
                fillOpacity={0.4} 
              />
              <XAxis
                dataKey="week"
                tickLine={false}
                tickMargin={5}
                axisLine={true}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <ChartLegend verticalAlign="top" content={<ChartLegendContent payload={[]} />} />
            </AreaChart>
          </ChartContainer>
        </div>
      )}
    </div>
  )
}
