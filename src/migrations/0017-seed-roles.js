/**
 * Migration: Seed predefined delegation relationship Roles
 *
 * Creates the predefined Role documents referenced by Delegation.roleIds.
 * Idempotent: safe to run multiple times (upserts by unique `key`).
 *
 * Run with: node src/migrations/0017-seed-roles.js
 *
 * Requires `npx prisma generate` to have run first (Role model in the client)
 * and DB connectivity (DATABASE_URL from .env.local).
 */

const { PrismaClient } = require('../../generated/prisma')
const prisma = new PrismaClient()

const ROLE_KEYS = [
  'DOCTOR',
  'TUTOR',
  'MENTOR',
  'TEACHER',
  'GUIDE',
  'ASSISTANT',
  'FRIEND',
  'CLOSE_FRIEND',
  'LAWYER',
  'SOLICITOR',
  'FAMILY',
  'HOUSEHOLD',
  'THERAPIST'
]

async function main() {
  let created = 0
  let unchanged = 0

  for (const key of ROLE_KEYS) {
    const existing = await prisma.role.findUnique({ where: { key } })
    if (!existing) {
      await prisma.role.create({ data: { key } })
      created += 1
      console.log(`Created role: ${key}`)
    } else {
      unchanged += 1
    }
  }

  const total = await prisma.role.count()
  console.log(`Roles seeded: ${created} created, ${unchanged} unchanged, ${total} total in collection.`)
}

main()
  .catch((error) => {
    console.error('Migration failed:', error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
