const { PrismaClient } = require('../generated/prisma')

const prisma = new PrismaClient()

async function migrateSettingsToTemplateRefs() {
  try {
    console.log('Starting migration of settings to template references...')
    
    // Find the default templates
    const dailyDefaultTemplate = await prisma.template.findFirst({
      where: { role: 'daily.default' }
    })
    
    const weeklyDefaultTemplate = await prisma.template.findFirst({
      where: { role: 'weekly.default' }
    })
    
    if (!dailyDefaultTemplate) {
      console.error('No daily.default template found!')
      return
    }
    
    if (!weeklyDefaultTemplate) {
      console.error('No weekly.default template found!')
      return
    }
    
    console.log(`Found daily template: ${dailyDefaultTemplate.id}`)
    console.log(`Found weekly template: ${weeklyDefaultTemplate.id}`)
    
    // Use raw MongoDB query to update all users
    const result = await prisma.$runCommandRaw({
      update: 'User',
      updates: [
        {
          q: {}, // Match all users
          u: {
            $set: {
              'settings.dailyTemplate': dailyDefaultTemplate.id,
              'settings.weeklyTemplate': weeklyDefaultTemplate.id
            }
          },
          multi: true
        }
      ]
    })
    
    console.log(`Migration completed. Modified ${result.nModified} users.`)
    
  } catch (error) {
    console.error('Error during migration:', error)
  } finally {
    await prisma.$disconnect()
  }
}

migrateSettingsToTemplateRefs()

