import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { buildMetadata } from '@/app/metadata'
import { defaultLocale } from './constants'

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({ locale: defaultLocale })
}

export default function RootPage() {
  redirect(`/${defaultLocale}`)
}


