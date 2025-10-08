import type { Metadata } from 'next'
import { buildMetadata } from '@/app/metadata'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  return buildMetadata({
    title: 'Dashboard',
    description: 'Your daily overview of mood, productivity, and earnings.',
    locale,
  })
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return children
}


