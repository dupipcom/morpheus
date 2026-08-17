import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { I18nProvider } from '@/lib/contexts/i18n'
import { cachedInternalGet } from '@/lib/public/internalFetch'
import { PublicListView } from '@/views/list/publicListView'

interface PublicListPayload {
  name?: string | null
  publicTagline?: string | null
  bio?: string | null
  profilePhoto?: string | null
  cover?: string | null
  [key: string]: unknown
}

// List fetch is cached by cachedInternalGet (React.cache) to avoid duplicate
// requests between generateMetadata and the page component
const getList = async (publicUrl: string): Promise<PublicListPayload | null> => {
  const data = await cachedInternalGet<{ taskList?: PublicListPayload }>(
    `/api/v1/tasklists/public/${publicUrl}`
  )
  return data?.taskList ?? null
}

export async function generateMetadata({
  params
}: {
  params: Promise<{ locale: string; publicUrl: string }>
}): Promise<Metadata> {
  const { publicUrl } = await params

  const taskList = await getList(publicUrl)

  if (!taskList) {
    return { title: 'List Not Found' }
  }

  const title = `${taskList.name || 'List'} · Dupip`
  const description = taskList.publicTagline || taskList.bio || undefined
  const image = taskList.cover || taskList.profilePhoto

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: image ? [image] : [],
      type: 'website'
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: image ? [image] : []
    }
  }
}

export default async function PublicListPage({
  params
}: {
  params: Promise<{ locale: string; publicUrl: string }>
}) {
  const { locale, publicUrl } = await params

  const taskList = await getList(publicUrl)
  if (!taskList) {
    notFound()
  }

  return (
    <I18nProvider locale={locale as any}>
      <PublicListView taskList={taskList} locale={locale} />
    </I18nProvider>
  )
}
