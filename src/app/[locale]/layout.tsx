import { ReactNode } from 'react'
import type { Metadata } from 'next'
import { buildMetadata } from '@/app/metadata'

interface LocalizedLayoutProps {
  children: ReactNode
  params: Promise<{ locale: string }>
}

export default async function LocalizedLayout({ children, params }: LocalizedLayoutProps) {
  const { locale } = await params

  return (
    <>{children}</>
  )
} 

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  return await buildMetadata({ locale })
}