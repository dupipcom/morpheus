'use client'

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useI18n } from '@/lib/contexts/i18n'
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
    simplifiedMoodChart?: {
      weeksData: Array<{
        week: number
        moodAverage: number
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

const simplifiedMoodChartConfig = {
  moodAverage: {
    label: "Mood Average (%)",
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
  const { t } = useI18n()
  if (!chartsData) {
    return (
      <div className="text-center text-muted-foreground">
        <p>{t('publicCharts.noData')}</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Mood Charts */}
      {chartsData.moodCharts && (
        <div>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4 gap-2">
            <div className="min-w-0">
              <h3 className="text-lg font-semibold">{t('publicCharts.moodTrackingTitle')}</h3>
              <p className="text-sm text-muted-foreground">{t('publicCharts.moodTrackingSubtitle')}</p>
            </div>
            <div>
              <Badge variant="outline">{t('publicCharts.moodChartsTag')}</Badge>
            </div>
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

      {/* Simplified Mood Chart */}
      {chartsData.simplifiedMoodChart && (
        <div>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4 gap-2">
            <div className="min-w-0">
              <h3 className="text-lg font-semibold">{t('publicCharts.moodOverviewTitle')}</h3>
              <p className="text-sm text-muted-foreground">{t('publicCharts.moodOverviewSubtitle')}</p>
            </div>
            <div>
              <Badge variant="outline">{t('publicCharts.simplifiedMoodTag')}</Badge>
            </div>
          </div>
          
          <ChartContainer config={simplifiedMoodChartConfig}>
            <AreaChart data={chartsData.simplifiedMoodChart.weeksData} accessibilityLayer>
              <CartesianGrid vertical={true} horizontal={true} />
              <Area 
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

      {/* Productivity Charts */}
      {chartsData.productivityCharts && (
        <div>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4 gap-2">
            <div className="min-w-0">
              <h3 className="text-lg font-semibold">{t('publicCharts.productivityTitle')}</h3>
              <p className="text-sm text-muted-foreground">{t('publicCharts.productivitySubtitle')}</p>
            </div>
            <div>
              <Badge variant="outline">{t('publicCharts.productivityTag')}</Badge>
            </div>
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
          <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4 gap-2">
            <div className="min-w-0">
              <h3 className="text-lg font-semibold">{t('publicCharts.earningsTitle')}</h3>
              <p className="text-sm text-muted-foreground">{t('publicCharts.earningsSubtitle')}</p>
            </div>
            <div>
              <Badge variant="outline">{t('publicCharts.earningsTag')}</Badge>
            </div>
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
