import { useI18n } from '@/lib/contexts/i18n'

export const getClerkLocalization = (locale: string) => {
  // Import the locale file dynamically
  const localeData = require(`@/locales/${locale}.json`)
  
  return {
    userProfile: {
      formButtonPrimary__save: localeData.common.save,
      formButtonPrimary__cancel: localeData.common.cancel,
      formButtonPrimary__continue: localeData.common.save,
      formButtonPrimary__finish: localeData.common.save,
      formButtonPrimary__remove: localeData.common.delete,
      formButtonPrimary__add: localeData.common.save,
      formButtonPrimary__update: localeData.common.save,
      formButtonPrimary__submit: localeData.common.save,
      formButtonPrimary__confirm: localeData.common.save,
      formButtonPrimary__proceed: localeData.common.save,
      formButtonPrimary__next: localeData.common.save,
      formButtonPrimary__back: localeData.common.cancel,
      formButtonPrimary__close: localeData.common.close,
      formButtonPrimary__dismiss: localeData.common.dismiss,
      formButtonPrimary__ok: localeData.common.save,
      formButtonPrimary__yes: localeData.common.save,
      formButtonPrimary__no: localeData.common.cancel,
      formButtonPrimary__retry: localeData.common.save,
      formButtonPrimary__resend: localeData.common.save,
      formButtonPrimary__verify: localeData.common.save,
      formButtonPrimary__signIn: localeData.common.login,
      formButtonPrimary__signUp: localeData.common.signUp,
      formButtonPrimary__signOut: localeData.common.signOut,
      formButtonPrimary__manageAccount: localeData.common.manageAccount,
    },
    userButton: {
      action__manageAccount: localeData.common.manageAccount,
      action__signOut: localeData.common.signOut,
    },
  }
}

// Hook version for use in components
export const useClerkLocalization = () => {
  const { t } = useI18n()
  
  return {
    userProfile: {
      manageAccount: t('common.manageAccount'),
    },
    userButton: {
      signOut: t('common.signOut'),
    },
  }
} 