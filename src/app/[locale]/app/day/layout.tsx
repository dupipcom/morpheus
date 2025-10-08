import type { Metadata } from 'next'
import { buildMetadata } from '@/app/metadata'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  return buildMetadata({
    title: 'Day',
    description: 'Log your day: tasks, mood, and progress.',
    locale,
  })
}

export default function DayLayout({ children }: { children: React.ReactNode }) {
  return children
}


