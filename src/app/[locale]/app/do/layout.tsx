import type { Metadata } from 'next'
import { buildMetadata } from '@/app/metadata'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  return await buildMetadata({
    title: 'Do',
    description: 'Track your daily tasks and productivity.',
    locale,
  })
}

export default function DoLayout({ children }: { children: React.ReactNode }) {
  return children
}

