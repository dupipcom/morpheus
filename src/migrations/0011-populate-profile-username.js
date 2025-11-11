/**
 * Migration: Populate Profile.username from profile.data.username.value
 * 
 * This migration populates the new root-level `username` field on the Profile model
 * from the existing nested `data.username.value` structure.
 * 
 * Run with: node src/migrations/0011-populate-profile-username.js
 */

const { PrismaClient } = require('../../generated/prisma')
const prisma = new PrismaClient()

async function main() {
  console.log('Starting migration: Populate Profile.username from profile.data.username.value')
  
  try {
    // Fetch all profiles
    const profiles = await prisma.profile.findMany({
      select: {
        id: true,
        username: true,
        data: true
      }
    })

    console.log(`Found ${profiles.length} profiles to process`)

    let updated = 0
    let skipped = 0
    let errors = 0

    for (const profile of profiles) {
      try {
        // Skip if username already exists at root level
        if (profile.username) {
          skipped++
          continue
        }

        // Extract username from data.username.value
        const profileData = profile.data || {}
        const username = profileData.username?.value

        if (!username) {
          console.log(`  Profile ${profile.id}: No username found in data, skipping`)
          skipped++
          continue
        }

        // Update profile with root level username
        await prisma.profile.update({
          where: { id: profile.id },
          data: {
            username: username
          }
        })

        updated++
        console.log(`  Profile ${profile.id}: Set username to "${username}"`)
      } catch (error) {
        errors++
        console.error(`  Error updating profile ${profile.id}:`, error.message)
      }
    }

    console.log('\nMigration completed:')
    console.log(`  Updated: ${updated}`)
    console.log(`  Skipped: ${skipped}`)
    console.log(`  Errors: ${errors}`)
  } catch (error) {
    console.error('Migration failed:', error)
    throw error
  }
}

main()
  .catch((e) => {
    console.error('Migration error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

