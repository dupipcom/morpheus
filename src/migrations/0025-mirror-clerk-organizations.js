/**
 * Migration 0025: Mirror Clerk organizations (Phase 7)
 *
 * Pull all Clerk orgs + memberships (paginated) and upsert the Organization /
 * OrgMembership mirror; copy from ChatOrgMembership where Clerk is
 * unreachable; seed username handles and default org wallets.
 *
 * Idempotent: upserts keyed on clerkOrgId / (orgId, userId); re-runs converge.
 *
 * Run with: node src/migrations/0025-mirror-clerk-organizations.js
 */

const { PrismaClient } = require('../../generated/prisma')
const prisma = new PrismaClient()

function slugify(name) {
  return (
    (name || 'org')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'org'
  )
}

async function generateUsername(name) {
  let candidate = slugify(name)
  for (let attempt = 0; attempt < 10; attempt++) {
    const clash = await prisma.organization.findUnique({ where: { username: candidate }, select: { id: true } })
    if (!clash) return candidate
    candidate = `${slugify(name)}-${attempt + 1}`
  }
  return `${candidate}-${Date.now()}`
}

async function main() {
  let clerkAvailable = true
  let clerkOrgs = []

  try {
    const { clerkClient } = await import('@clerk/nextjs/server')
    const client = await clerkClient()
    clerkOrgs = []
    const first = await client.organizations.getOrganizationList({ limit: 500 })
    clerkOrgs = [...first.data]
  } catch (error) {
    console.warn('Clerk unreachable — falling back to ChatOrgMembership mirror:', error)
    clerkAvailable = false
  }

  if (clerkAvailable && clerkOrgs.length > 0) {
    let created = 0
    let updated = 0
    for (const org of clerkOrgs) {
      const existing = await prisma.organization.findUnique({
        where: { clerkOrgId: org.id },
        select: { id: true }
      })
      if (existing) {
        await prisma.organization.update({
          where: { id: existing.id },
          data: { name: org.name, imageUrl: org.imageUrl ?? null }
        })
        updated++
      } else {
        await prisma.organization.create({
          data: {
            clerkOrgId: org.id,
            username: await generateUsername(org.name),
            name: org.name,
            imageUrl: org.imageUrl ?? null,
            publicVisible: false,
            verified: false,
            status: 'ACTIVE',
            createdByUserId: ''
          }
        })
        created++
      }
    }
    console.log(`Clerk mirror: ${created} created, ${updated} updated`)

    // Memberships
    const { clerkClient } = await import('@clerk/nextjs/server')
    const client = await clerkClient()
    for (const org of clerkOrgs) {
      const mirror = await prisma.organization.findUnique({ where: { clerkOrgId: org.id }, select: { id: true } })
      if (!mirror) continue
      const memberships = await client.organizations.getOrganizationMembershipList({
        organizationId: org.id,
        limit: 500
      })
      for (const membership of memberships.data) {
        const clerkUserId = membership.publicUserData?.userId
        if (!clerkUserId) continue
        const user = await prisma.user.findUnique({ where: { userId: clerkUserId }, select: { id: true } })
        if (!user) continue
        await prisma.orgMembership.upsert({
          where: { orgId_userId: { orgId: mirror.id, userId: user.id } },
          update: { role: String(membership.role).toUpperCase(), clerkOrgId: org.id },
          create: {
            orgId: mirror.id,
            userId: user.id,
            role: String(membership.role).toUpperCase(),
            clerkOrgId: org.id
          }
        })
        if ((String(membership.role).toUpperCase() === 'OWNER' || String(membership.role).toUpperCase() === 'ADMIN')) {
          const mirrorFull = await prisma.organization.findUnique({ where: { id: mirror.id }, select: { createdByUserId: true } })
          if (!mirrorFull?.createdByUserId) {
            await prisma.organization.update({ where: { id: mirror.id }, data: { createdByUserId: user.id } })
          }
        }
      }
    }
  } else {
    // Fallback: copy from ChatOrgMembership
    const chatRows = await prisma.chatOrgMembership.findMany()
    console.log(`Clerk unreachable: copying ${chatRows.length} ChatOrgMembership rows`)
    const byOrg = new Map()
    for (const row of chatRows) {
      if (!byOrg.has(row.clerkOrgId)) byOrg.set(row.clerkOrgId, [])
      byOrg.get(row.clerkOrgId).push(row)
    }
    for (const [clerkOrgId, rows] of byOrg) {
      const existing = await prisma.organization.findUnique({
        where: { clerkOrgId },
        select: { id: true }
      })
      const mirror = existing ?? await prisma.organization.create({
        data: {
          clerkOrgId,
          username: await generateUsername(clerkOrgId),
          name: clerkOrgId,
          imageUrl: null,
          publicVisible: false,
          verified: false,
          status: 'ACTIVE',
          createdByUserId: ''
        }
      })
      for (const row of rows) {
        await prisma.orgMembership.upsert({
          where: { orgId_userId: { orgId: mirror.id, userId: row.userId } },
          update: { role: String(row.role).toUpperCase() === 'ADMIN' ? 'ADMIN' : 'MEMBER', clerkOrgId },
          create: {
            orgId: mirror.id,
            userId: row.userId,
            role: String(row.role).toUpperCase() === 'ADMIN' ? 'ADMIN' : 'MEMBER',
            clerkOrgId
          }
        })
      }
    }
  }

  // Default org wallets (kind ORG) for mirrored orgs that lack one
  const orgs = await prisma.organization.findMany({ select: { id: true, name: true, createdByUserId: true } })
  let wallets = 0
  for (const org of orgs) {
    const existingWallet = await prisma.wallet.findFirst({ where: { kind: 'ORG', orgId: org.id } })
    if (existingWallet) continue
    const stewardId = org.createdByUserId || (await prisma.user.findFirst({ select: { id: true }, orderBy: { createdAt: 'asc' } }))?.id
    if (!stewardId) continue
    await prisma.wallet.create({
      data: {
        userId: stewardId,
        name: `${org.name} wallet`,
        kind: 'ORG',
        ownerType: 'ORG',
        orgId: org.id,
        balance: 0,
        pendingBalance: 0,
        address: null
      }
    })
    wallets++
  }
  console.log(`Done. Org wallets created: ${wallets}.`)
}

main()
  .catch((error) => {
    console.error('Migration failed:', error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
