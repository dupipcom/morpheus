import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { I18nProvider } from '@/lib/contexts/i18n'
import { cachedInternalGet } from '@/lib/public/internalFetch'
import { PublicOrgView } from '@/views/org/publicOrgView'

interface PublicOrgPayload {
  name?: string | null
  username?: string | null
  bio?: string | null
  imageUrl?: string | null
  [key: string]: unknown
}

// Org fetch is cached by cachedInternalGet (React.cache) to avoid duplicate
// requests between generateMetadata and the page component
const getOrg = async (username: string): Promise<PublicOrgPayload | null> => {
  const data = await cachedInternalGet<{ organization?: PublicOrgPayload }>(
    `/api/v1/orgs/public/${username}`
  )
  return data?.organization ?? null
}

export async function generateMetadata({
  params
}: {
  params: Promise<{ locale: string; orgUsername: string }>
}): Promise<Metadata> {
  const { orgUsername } = await params

  const organization = await getOrg(orgUsername)

  if (!organization) {
    return { title: 'Organization Not Found' }
  }

  const title = `${organization.name || 'Organization'} · Dupip`
  const description = organization.bio || undefined

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: organization.imageUrl ? [organization.imageUrl] : [],
      type: 'website'
    },
    twitter: {
      card: 'summary',
      title,
      description,
      images: organization.imageUrl ? [organization.imageUrl] : []
    }
  }
}

export default async function PublicOrgPage({
  params
}: {
  params: Promise<{ locale: string; orgUsername: string }>
}) {
  const { locale, orgUsername } = await params

  const organization = await getOrg(orgUsername)
  if (!organization) {
    notFound()
  }

  return (
    <I18nProvider locale={locale as any}>
      <PublicOrgView organization={organization} locale={locale} />
    </I18nProvider>
  )
}
