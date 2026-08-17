import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { I18nProvider } from '@/lib/contexts/i18n'
import { cachedInternalGet } from '@/lib/public/internalFetch'
import { PublicJobView } from '@/views/list/publicJobView'

interface PublicListPayload {
  name?: string | null
  publicUrl?: string | null
  profilePhoto?: string | null
  publicTasks?: Array<Record<string, unknown>>
  [key: string]: unknown
}

const getList = async (publicUrl: string): Promise<PublicListPayload | null> => {
  const data = await cachedInternalGet<{ taskList?: PublicListPayload }>(
    `/api/v1/tasklists/public/${publicUrl}`
  )
  return data?.taskList ?? null
}

export async function generateMetadata({
  params
}: {
  params: Promise<{ locale: string; publicUrl: string; taskId: string }>
}): Promise<Metadata> {
  const { publicUrl, taskId } = await params

  const taskList = await getList(publicUrl)
  const task = taskList?.publicTasks?.find((t: any) => t.id === taskId)

  if (!taskList || !task) {
    return { title: 'Job Not Found' }
  }

  const title = `${task.name} · ${taskList.name} · Dupip`
  const description = typeof task.jobDescription === 'string' ? task.jobDescription : undefined

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: taskList.profilePhoto ? [taskList.profilePhoto] : [],
      type: 'website'
    },
    twitter: {
      card: 'summary',
      title,
      description
    }
  }
}

export default async function PublicJobPage({
  params
}: {
  params: Promise<{ locale: string; publicUrl: string; taskId: string }>
}) {
  const { locale, publicUrl, taskId } = await params

  const taskList = await getList(publicUrl)
  const task = taskList?.publicTasks?.find((t: any) => t.id === taskId)

  if (!taskList || !task) {
    notFound()
  }

  return (
    <I18nProvider locale={locale as any}>
      <PublicJobView task={task} taskList={taskList} locale={locale} />
    </I18nProvider>
  )
}
