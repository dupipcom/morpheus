import type { Metadata } from 'next'
import { buildMetadata } from '@/app/metadata'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  return buildMetadata({
    title: 'Profile',
    description: 'Edit your public profile and sharing preferences.',
    locale,
  })
}

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return children
}


