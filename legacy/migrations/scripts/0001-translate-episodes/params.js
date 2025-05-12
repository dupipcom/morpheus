ALL_TRANSLATION_LOCALES = ['it', 'pt', 'es', 'de', 'fr', 'ro', 'pl', 'cz', 'se', 'ee', 'jp', 'ru']

const entry = {
  slug: 'guests-only-dreamy-hours-wednesdays-in-london-yang-yoga-self-defense-live',
  slugField: 'url'
}

const params = {
  ...entry,
  fieldName: ['title'],
  richFieldName: [],
  locale: entry.slug ? ALL_TRANSLATION_LOCALES : ['it', 'pt', 'es', 'de', 'fr', 'ro', 'pl', 'cz', 'se', 'ee', 'jp', 'ru'],
  type: 'events',
  model: 'gpt-4',
  chunkSize: 3,
  limit: 3500,
  sourceEnv: 'staging',
  targetEnv: 'prod-0010'
}

module.exports = {
  params
};