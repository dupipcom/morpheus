import type { Metadata } from 'next'
import { buildMetadata } from '@/app/metadata'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  return await buildMetadata({
    title: 'Feel',
    description: 'Track your mood and emotional wellbeing.',
    locale,
  })
}

export default function FeelLayout({ children }: { children: React.ReactNode }) {
  return children
}


