import type { Metadata } from 'next'
import { buildMetadata } from '@/app/metadata'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  return await buildMetadata({
    title: 'Week',
    description: 'Plan and review your week with DreamPip.',
    locale,
  })
}

export default function WeekLayout({ children }: { children: React.ReactNode }) {
  return children
}


