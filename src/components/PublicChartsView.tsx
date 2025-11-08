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
    color: "var(--area-mood-average)",
  },
  gratitude: {
    label: "Gratitude (%)",
    color: "var(--area-gratitude)",
  },
  optimism: {
    label: "Optimism (%)",
    color: "var(--area-optimism)",
  },
  restedness: {
    label: "Restedness (%)",
    color: "var(--area-restedness)",
  },
  tolerance: {
    label: "Tolerance (%)",
    color: "var(--area-tolerance)",
  },
  selfEsteem: {
    label: "Self Esteem (%)",
    color: "var(--area-self-esteem)",
  },
  trust: {
    label: "Trust (%)",
    color: "var(--area-trust)",
  },
} satisfies ChartConfig

const simplifiedMoodChartConfig = {
  moodAverage: {
    label: "Mood Average (%)",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig

const productivityChartConfig = {
  moodAverage: {
    label: "Mood Average (%)",
    color: "var(--area-self-esteem)",
  },
  progress: {
    label: "Progress (%)",
    color: "var(--area-progress)",
  },
} satisfies ChartConfig

const earningsChartConfig = {
  earnings: {
    label: "Earnings (%)",
    color: "var(--area-earnings)",
  },
  balance: {
    label: "Balance (%)",
    color: "var(--area-balance)",
  },
  moodAverage: {
    label: "Mood Average (%)",
    color: "var(--area-self-esteem)",
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
                stroke="var(--area-mood-average)" 
                fill="var(--area-mood-average)" 
                radius={4} 
                fillOpacity={0.4} 
              />
              <Area 
                stackId="1" 
                type="monotone" 
                dataKey="gratitude" 
                stroke="var(--area-gratitude)" 
                fill="var(--area-gratitude)" 
                radius={4} 
                fillOpacity={0.4} 
              />
              <Area 
                stackId="1" 
                type="monotone" 
                dataKey="optimism" 
                stroke="var(--area-optimism)" 
                fill="var(--area-optimism)" 
                radius={4} 
                fillOpacity={0.4} 
              />
              <Area 
                stackId="1" 
                type="monotone" 
                dataKey="restedness" 
                stroke="var(--area-restedness)" 
                fill="var(--area-restedness)" 
                radius={4} 
                fillOpacity={0.4} 
              />
              <Area 
                stackId="1" 
                type="monotone" 
                dataKey="tolerance" 
                stroke="var(--area-tolerance)" 
                fill="var(--area-tolerance)" 
                radius={4} 
                fillOpacity={0.4} 
              />
              <Area 
                stackId="1" 
                type="monotone" 
                dataKey="selfEsteem" 
                stroke="var(--area-self-esteem)" 
                fill="var(--area-self-esteem)" 
                radius={4} 
                fillOpacity={0.4} 
              />
              <Area 
                stackId="1" 
                type="monotone" 
                dataKey="trust" 
                stroke="var(--area-trust)" 
                fill="var(--area-trust)" 
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
                stroke="var(--chart-2)" 
                fill="var(--chart-2)" 
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
                stroke="var(--area-self-esteem)" 
                fill="var(--area-self-esteem)" 
                radius={4} 
                fillOpacity={0.4} 
              />
              <Area 
                stackId="2" 
                type="monotone" 
                dataKey="progress" 
                stroke="var(--area-progress)" 
                fill="var(--area-progress)" 
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
                stroke="var(--area-earnings)" 
                fill="var(--area-earnings)" 
                radius={4} 
                fillOpacity={0.4} 
              />
              <Area 
                stackId="2" 
                type="monotone" 
                dataKey="balance" 
                stroke="var(--area-balance)" 
                fill="var(--area-balance)" 
                radius={4} 
                fillOpacity={0.4} 
              />
              <Area 
                stackId="3" 
                type="monotone" 
                dataKey="moodAverage" 
                stroke="var(--area-self-esteem)" 
                fill="var(--area-self-esteem)" 
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
