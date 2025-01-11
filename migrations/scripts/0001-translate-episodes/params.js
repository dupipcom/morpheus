ALL_TRANSLATION_LOCALES = ['it', 'pt', 'es', 'de', 'fr', 'ro', 'pl', 'cz', 'se', 'ee', 'jp', 'ru',  'ar', 'he', 'zh', 'nl', 'da', 'hu', 'ca', 'eu', 'gl', 'sw', 'hi', 'ms', 'bn', 'pa', 'tr', 'fi', 'el', 'ko']

const entry = {
  slug: '',
  slugField: 'url'
}

const params = {
  ...entry,
  fieldName: [],
  richFieldName: ['body'],
  locale: ['ar', 'hi', 'ms', 'bn', 'pa', 'tr', 'fi', 'el', 'ko'],
  type: 'events',
  model: 'gpt-4',
  chunkSize: 3,
  limit: 3500,
  sourceEnv: 'migration-0001',
  targetEnv: 'migration-0001',
}

module.exports = {
  params
};