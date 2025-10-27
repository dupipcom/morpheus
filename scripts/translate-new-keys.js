/*
  Translate newly added i18n keys across all locales using en.json as source.
  Requires: set DEEPL_API_KEY in environment to use DeepL API.

  Usage:
    DEEPL_API_KEY=your_key node scripts/translate-new-keys.js
*/

const fs = require('fs')
const path = require('path')

const localesDir = path.resolve(__dirname, '..', 'src', 'locales')
const enPath = path.join(localesDir, 'en.json')

const TARGET_KEYS = [
  // common
  'common.newTask',
  'common.newList',
  'common.newTemplate',
  'common.budget',
  'common.due',
  // tasks
  'tasks.selectList',
  // mood.publish
  'mood.publish.title',
  'mood.publish.placeholder',
  'mood.publish.selectVisibility',
  'mood.publish.visibility.PRIVATE',
  'mood.publish.visibility.FRIENDS',
  'mood.publish.visibility.CLOSE_FRIENDS',
  'mood.publish.visibility.PUBLIC',
  'mood.publish.visibility.AI_ENABLED',
  'mood.publish.action',
  // forms common options
  'forms.commonOptions.entities.list',
  'forms.commonOptions.entities.template',
  'forms.commonOptions.area.self',
  'forms.commonOptions.area.home',
  'forms.commonOptions.area.social',
  'forms.commonOptions.area.work',
  'forms.commonOptions.category.custom',
  'forms.commonOptions.category.body',
  'forms.commonOptions.category.mind',
  'forms.commonOptions.category.spirit',
  'forms.commonOptions.category.social',
  'forms.commonOptions.category.work',
  'forms.commonOptions.category.home',
  'forms.commonOptions.category.fun',
  'forms.commonOptions.category.growth',
  'forms.commonOptions.category.community',
  'forms.commonOptions.category.affection',
  'forms.commonOptions.category.clean',
  'forms.commonOptions.category.maintenance',
  'forms.commonOptions.category.spirituality',
  'forms.commonOptions.category.event',
  // forms addTaskForm
  'forms.addTaskForm.title',
  'forms.addTaskForm.taskNameLabel',
  'forms.addTaskForm.taskNamePlaceholder',
  'forms.addTaskForm.areaLabel',
  'forms.addTaskForm.categoryLabel',
  'forms.addTaskForm.timesLabel',
  'forms.addTaskForm.saveToTemplate',
  'forms.addTaskForm.addTask',
  'forms.addTaskForm.cancel',
  // forms addListForm
  'forms.addListForm.titleCreate',
  'forms.addListForm.titleEdit',
  'forms.addListForm.nameLabel',
  'forms.addListForm.templateOrListLabel',
  'forms.addListForm.chooseTemplatePlaceholder',
  'forms.addListForm.budgetLabel',
  'forms.addListForm.dueDateLabel',
  'forms.addListForm.pickDatePlaceholder',
  'forms.addListForm.cadenceLabel',
  'forms.addListForm.cadence.oneOff',
  'forms.addListForm.cadence.daily',
  'forms.addListForm.cadence.weekly',
  'forms.addListForm.cadence.monthly',
  'forms.addListForm.cadence.quarterly',
  'forms.addListForm.cadence.semester',
  'forms.addListForm.cadence.yearly',
  'forms.addListForm.collaboratorsLabel',
  'forms.addListForm.searchUsernames',
  'forms.addListForm.typeAUsername',
  'forms.addListForm.noResults',
  'forms.addListForm.selectedCount',
  'forms.addListForm.roleLabel',
  'forms.addListForm.role.custom',
  'forms.addListForm.role.default',
  'forms.addListForm.addTaskButton',
  'forms.addListForm.table.name',
  'forms.addListForm.table.times',
  'forms.addListForm.table.area',
  'forms.addListForm.table.categories',
  'forms.addListForm.create',
  'forms.addListForm.save',
  'forms.addListForm.cancel',
  'forms.addListForm.deleteListConfirm',
  'forms.addListForm.deleteList',
  // forms addTemplateForm
  'forms.addTemplateForm.title',
  'forms.addTemplateForm.nameLabel',
  'forms.addTemplateForm.createFromLabel',
  'forms.addTemplateForm.chooseListToClonePlaceholder',
  'forms.addTemplateForm.visibilityLabel',
  'forms.addTemplateForm.visibility.private',
  'forms.addTemplateForm.visibility.public',
  'forms.addTemplateForm.visibility.friends',
  'forms.addTemplateForm.visibility.closeFriends',
  'forms.addTemplateForm.addTaskButton',
  'forms.addTemplateForm.task.nameLabel',
  'forms.addTemplateForm.task.areaLabel',
  'forms.addTemplateForm.task.categoryLabel',
  'forms.addTemplateForm.task.timesLabel',
  'forms.addTemplateForm.task.add',
  'forms.addTemplateForm.task.cancel',
  'forms.addTemplateForm.table.name',
  'forms.addTemplateForm.table.times',
  'forms.addTemplateForm.table.area',
  'forms.addTemplateForm.table.categories',
  'forms.addTemplateForm.create',
  'forms.addTemplateForm.cancel',
]

const deeplKey = process.env.DEEPL_API_KEY
const useDeepl = Boolean(deeplKey)

// Map file base names to DeepL target language codes
const localeToDeepl = {
  ar: 'AR', bn: 'BN', ca: 'CA', cs: 'CS', da: 'DA', de: 'DE', el: 'EL',
  es: 'ES', et: 'ET', eu: 'EU', fi: 'FI', fr: 'FR', gl: 'GL', ha: 'HA', he: 'HE',
  hi: 'HI', hu: 'HU', it: 'IT', ja: 'JA', ko: 'KO', ms: 'MS', nl: 'NL', pa: 'PA',
  pl: 'PL', pt: 'PT-PT', ro: 'RO', ru: 'RU', sv: 'SV', sw: 'SW', tr: 'TR', yo: 'YO', zh: 'ZH'
}

function get(obj, pathStr) {
  return pathStr.split('.').reduce((acc, k) => (acc && typeof acc === 'object' ? acc[k] : undefined), obj)
}

function set(obj, pathStr, value) {
  const parts = pathStr.split('.')
  let cur = obj
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i]
    if (typeof cur[p] !== 'object' || cur[p] === null) cur[p] = {}
    cur = cur[p]
  }
  cur[parts[parts.length - 1]] = value
}

async function deeplTranslateBatch(texts, targetLang) {
  if (!Array.isArray(texts) || texts.length === 0) return []
  const url = 'https://api-free.deepl.com/v2/translate'
  const params = new URLSearchParams()
  for (const t of texts) {
    params.append('text', t)
  }
  params.append('target_lang', targetLang)
  params.append('source_lang', 'EN')
  // Help preserve placeholders and punctuation
  params.append('preserve_formatting', '1')

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `DeepL-Auth-Key ${deeplKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })
  if (!res.ok) throw new Error(`DeepL HTTP ${res.status}`)
  const data = await res.json()
  const arr = data?.translations || []
  return arr.map(x => x?.text || '')
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function translateKeysForLocale(localeFile, enData) {
  if (!useDeepl) {
    console.warn('DEEPL_API_KEY not set; skipping translations for', localeFile)
    return false
  }
  const locale = path.basename(localeFile, '.json')
  const targetLang = localeToDeepl[locale]
  if (!targetLang) {
    console.warn('No DeepL mapping for locale', locale, '- skipping')
    return false
  }
  const raw = fs.readFileSync(localeFile, 'utf8')
  const data = JSON.parse(raw)

  // Build batch of texts to translate in the same order as keys
  const toTranslate = [] // { keyPath, enVal }
  for (const keyPath of TARGET_KEYS) {
    const enVal = get(enData, keyPath)
    if (typeof enVal !== 'string' || !enVal) continue
    const curVal = get(data, keyPath)
    if (typeof curVal === 'string' && curVal.trim() && curVal.trim() !== enVal.trim()) continue
    toTranslate.push({ keyPath, enVal })
  }
  if (toTranslate.length === 0) return false

  // Call DeepL in a single request for this file, with throttling and retry
  let translations = []
  let attempt = 0
  while (attempt < 4) {
    try {
      translations = await deeplTranslateBatch(toTranslate.map(x => x.enVal), targetLang)
      break
    } catch (e) {
      attempt++
      if (String(e.message).includes('429')) {
        const backoff = 1000 * Math.pow(2, attempt) // 2s,4s,8s
        console.warn(`Rate limited for ${locale}. Retrying in ${backoff}ms (attempt ${attempt})`)
        await sleep(backoff)
      } else {
        console.warn(`Failed to translate batch for ${locale}: ${e.message}`)
        break
      }
    }
  }
  if (translations.length === toTranslate.length) {
    toTranslate.forEach((item, idx) => {
      const translated = translations[idx]
      if (translated && translated.trim()) set(data, item.keyPath, translated)
    })
    fs.writeFileSync(localeFile, JSON.stringify(data, null, 2) + '\n', 'utf8')
    return true
  }
  return false
}

async function main() {
  if (!fs.existsSync(enPath)) {
    console.error('en.json not found at', enPath)
    process.exit(1)
  }
  const en = JSON.parse(fs.readFileSync(enPath, 'utf8'))
  let files = fs.readdirSync(localesDir).filter(f => f.endsWith('.json') && f !== 'en.json')
  // Optional CLI arg: --only=xx or positional locale code
  const argOnly = (process.argv.find(a => a.startsWith('--only=')) || '').split('=')[1] || process.argv[2]
  if (argOnly) {
    const target = `${argOnly.replace('.json','')}.json`
    files = files.filter(f => f === target)
    if (files.length === 0) {
      console.warn('No matching locale file for', argOnly)
      return
    }
  }

  let totalChanged = 0
  let lastCallTs = 0
  for (const f of files) {
    const full = path.join(localesDir, f)
    // Throttle: ensure >= 1s between calls
    const now = Date.now()
    const elapsed = now - lastCallTs
    if (elapsed < 1000) {
      // eslint-disable-next-line no-await-in-loop
      await sleep(1000 - elapsed)
    }
    // eslint-disable-next-line no-await-in-loop
    const changed = await translateKeysForLocale(full, en)
    lastCallTs = Date.now()
    if (changed) totalChanged++
  }
  console.log(`Translated updates written for ${totalChanged} locale file(s).`)
}

// Node18 has global fetch
main().catch((e) => { console.error(e); process.exit(1) })


