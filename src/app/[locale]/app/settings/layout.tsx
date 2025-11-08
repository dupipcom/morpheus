import type { Metadata } from 'next'
import { buildMetadata } from '@/app/metadata'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  return await buildMetadata({
    title: 'Settings',
    description: 'Manage your Dupip preferences and privacy.',
    locale,
  })
}

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return children
}


