import DoPage from '@/views/do/doPage'

export const maxDuration = 60

/**
 * Task deep link: /app/do/list/{listId}/{taskId}
 * Opens the list with the deeplinked task first and highlighted.
 */
export default async function DoListTaskPage({
  params
}: {
  params: Promise<{ locale: string; listId: string; taskId: string }>
}) {
  const { locale, listId, taskId } = await params
  return <DoPage locale={locale} listId={listId} taskId={taskId} />
}
