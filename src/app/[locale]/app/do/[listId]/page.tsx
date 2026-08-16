import DoPage from '@/views/do/doPage'

// Allow streaming responses up to 60 seconds
export const maxDuration = 60

export default async function LocalizedDoWithListId({ params }: { params: Promise<{ locale: string; listId: string }> }) {
  const { locale, listId } = await params
  return <DoPage locale={locale} listId={listId} />
}
