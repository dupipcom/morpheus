import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { I18nProvider } from '@/lib/contexts/i18n'
import { cachedInternalGet } from '@/lib/public/internalFetch'
import { PublicProjectView } from '@/views/list/publicProjectView'

interface PublicProjectPayload {
  name?: string | null
  username?: string | null
  bio?: string | null
  photo?: string | null
  cover?: string | null
  [key: string]: unknown
}

// Project fetch is cached by cachedInternalGet (React.cache) to avoid duplicate
// requests between generateMetadata and the page component
const getProject = async (username: string): Promise<PublicProjectPayload | null> => {
  const data = await cachedInternalGet<{ project?: PublicProjectPayload }>(
    `/api/v1/projects/public/${username}`
  )
  return data?.project ?? null
}

export async function generateMetadata({
  params
}: {
  params: Promise<{ locale: string; username: string }>
}): Promise<Metadata> {
  const { username } = await params

  const project = await getProject(username)

  if (!project) {
    return { title: 'Project Not Found' }
  }

  const title = `${project.name || 'Project'} · Dupip`
  const description = project.bio || undefined
  const image = project.cover || project.photo

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

export default async function PublicProjectPage({
  params
}: {
  params: Promise<{ locale: string; username: string }>
}) {
  const { locale, username } = await params

  const project = await getProject(username)
  if (!project) {
    notFound()
  }

  return (
    <I18nProvider locale={locale as any}>
      <PublicProjectView project={project} locale={locale} />
    </I18nProvider>
  )
}
