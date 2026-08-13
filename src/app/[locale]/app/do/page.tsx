import DoPage from '@/views/do/doPage'

// Allow streaming responses up to 60 seconds
export const maxDuration = 60

export default async function LocalizedDo({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  return <DoPage locale={locale} />
}
