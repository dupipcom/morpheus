/**
 * Migration: Backfill List.publicUrl for lists missing it
 *
 * MongoDB unique indexes reject duplicate null values, so the unique index on
 * List.publicUrl cannot be built while several lists have publicUrl unset.
 * This fills the gap with the same slug algorithm as generatePublicUrl
 * (slugified name + last 4 chars of the id, retrying on collision), which is
 * what the app would have assigned when the list was created.
 *
 * Idempotent: only touches lists with missing/null publicUrl, and re-runs find
 * nothing left to do.
 *
 * Run with: node src/migrations/0020-backfill-list-public-urls.js
 */

const { PrismaClient } = require('../../generated/prisma')
const prisma = new PrismaClient()

function slugify(name) {
  return (
    (name || 'list')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'list'
  )
}

async function main() {
  const lists = await prisma.list.findMany({ select: { id: true, name: true, publicUrl: true } })
  const missing = lists.filter((l) => !l.publicUrl)
  console.log(`Found ${missing.length} lists without publicUrl out of ${lists.length} total`)

  const taken = new Set(lists.filter((l) => l.publicUrl).map((l) => l.publicUrl))

  let updated = 0
  for (const list of missing) {
    let slug = `${slugify(list.name)}-${list.id.slice(-4)}`
    for (let attempt = 0; taken.has(slug) && attempt < 5; attempt++) {
      slug = `${slugify(list.name)}-${list.id.slice(-4)}-${attempt + 1}`
    }
    if (taken.has(slug)) slug = `${slug}-${Date.now()}`

    taken.add(slug)
    await prisma.list.update({ where: { id: list.id }, data: { publicUrl: slug } })
    updated++
    if (updated % 50 === 0) console.log(`Updated ${updated} lists...`)
  }

  console.log(`Done. Assigned publicUrl to ${updated} lists.`)
}

main()
  .catch((error) => {
    console.error('Migration failed:', error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
