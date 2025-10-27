/*
  Sync all locale files with keys from en.json. Missing keys are filled with English defaults.
*/

const fs = require('fs')
const path = require('path')

const localesDir = path.resolve(__dirname, '..', 'src', 'locales')
const enPath = path.join(localesDir, 'en.json')

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function deepMergeDefaults(target, source) {
  // Ensure target is an object to merge into
  if (!isPlainObject(target)) {
    target = {}
  }
  for (const key of Object.keys(source)) {
    const srcVal = source[key]
    const tgtVal = target[key]
    if (isPlainObject(srcVal)) {
      target[key] = deepMergeDefaults(isPlainObject(tgtVal) ? tgtVal : {}, srcVal)
    } else if (Array.isArray(srcVal)) {
      if (typeof tgtVal === 'undefined') target[key] = srcVal
      // else leave existing array as-is
    } else {
      if (typeof tgtVal === 'undefined') target[key] = srcVal
      // else leave existing scalar as-is
    }
  }
  return target
}

function main() {
  if (!fs.existsSync(enPath)) {
    console.error('en.json not found at', enPath)
    process.exit(1)
  }
  const en = JSON.parse(fs.readFileSync(enPath, 'utf8'))
  const files = fs.readdirSync(localesDir).filter(f => f.endsWith('.json') && f !== 'en.json')

  let updated = 0
  for (const f of files) {
    const p = path.join(localesDir, f)
    try {
      const data = JSON.parse(fs.readFileSync(p, 'utf8'))
      const merged = deepMergeDefaults(data, en)
      // Pretty-print with 2 spaces to match repo style
      fs.writeFileSync(p, JSON.stringify(merged, null, 2) + '\n', 'utf8')
      updated++
    } catch (e) {
      console.error('Failed to update', f, e.message)
    }
  }
  console.log(`Updated ${updated} locale file(s).`)
}

main()


