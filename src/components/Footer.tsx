'use client'

import { useI18n } from "@/lib/contexts/i18n"
import { LocaleSelector } from "./locale-selector"

export function Footer() {
  const { t } = useI18n()
  const currentYear = new Date().getFullYear()

  return (
    <footer className="mt-8 md:mt-32 p-2">
      <div className={`m-auto max-w-[1200px] grid grid-cols-1 sm:grid-cols-3 md:grid-cols-3 text-[12px] flex w-full flex-col items-start p-2 pb-16 place-items-center`}>
        <small className="mb-4">
          {t('footer.copyright', { year: currentYear })}
          <br />{t('footer.iva')}
          <br />{t('footer.rea')}
          <br />{t('footer.cnpj')}
          <br /><br />
        </small>
        <div className="text-foreground flex flex-col items-center">
          <div className="rounded bg-accent dark:text-muted mb-2 flex overflow-hidden max-h-[32px] w-[128px]">
            <img src="/images/brazil.webp" className="w-[32px] object-cover" />
            <small className="p-2 text-[8px] font-bold">{t('footer.lgpdCompliant')}</small>
          </div>
          <div className="rounded bg-accent dark:text-muted mb-2 flex overflow-hidden max-h-[32px] w-[128px]">
            <img src="/images/europe.png" className="w-[32px] object-cover" />
            <small className="p-2 text-[8px] font-bold">{t('footer.gdprCompliant')}</small>
          </div>
          <div className="rounded bg-accent dark:text-muted mb-2 flex overflow-hidden max-h-[32px] w-[128px]">
            <img src="/images/europe.png" className="w-[32px] object-cover" />
            <small className="p-2 text-[8px] font-bold">{t('footer.doraReady')}</small>
          </div>
          <div className="m-8 flex items-center gap-2">
            <small className="text-[10px] text-muted-foreground">{t('navigation.locale')}:</small>
            <LocaleSelector className="h-8 text-xs" />
          </div>
        </div>
        <div className="flex flex-col">
          <small className="">{t('footer.insights')}
          <br /><br />{t('footer.cookies')}<br /><br /></small>
          <a href="/code" className=""><small>{t('footer.code')}</small></a>              
          <a href="/terms" className=""><small>{t('footer.terms')}</small></a>
          <a href="/privacy" className=""><small>{t('footer.privacy')}</small></a>
        </div>
      </div>
    </footer>
  )
} 