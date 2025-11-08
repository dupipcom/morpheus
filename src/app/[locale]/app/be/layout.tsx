import type { Metadata } from 'next'
import { buildMetadata } from '@/app/metadata'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  return await buildMetadata({
    title: 'Be',
    description: 'Connect with friends and share your progress.',
    locale,
  })
}

export default function BeLayout({ children }: { children: React.ReactNode }) {
  return children
}


