import type { Metadata } from 'next'
import { buildMetadata } from '@/app/metadata'
import { I18nProvider } from '@/lib/contexts/i18n'
import { loadTranslations, t } from '@/lib/i18n'
import type { Locale } from '@/lib/i18n'
import { PricingView } from '@/views/pricing/pricingView'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const translations = await loadTranslations(locale as Locale)
  return await buildMetadata({
    title: t(translations, 'pricing.metaTitle'),
    description: t(translations, 'pricing.metaDescription'),
    locale,
  })
}

export default async function PricingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params
  const translations = await loadTranslations(locale as Locale)

  return (
    <I18nProvider locale={locale as Locale}>
      <div className="container mx-auto px-4 py-8 space-y-12">
        <section className="text-center space-y-4 max-w-3xl mx-auto">
          <h1 className="text-3xl md:text-4xl font-bold">{t(translations, 'pricing.heroTitle')}</h1>
          <p className="text-muted-foreground">{t(translations, 'pricing.heroSubtitle')}</p>
        </section>

        <PricingView />
      </div>
    </I18nProvider>
  )
}
