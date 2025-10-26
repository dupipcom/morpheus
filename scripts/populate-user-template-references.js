const { PrismaClient } = require('../generated/prisma')

const prisma = new PrismaClient()

async function populateUserTemplateReferences() {
  try {
    console.log('Starting to populate user template references...')
    
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
    
    // Get all users
    const users = await prisma.user.findMany()
    
    console.log(`Found ${users.length} users to update`)
    
    // Update each user's settings with template references
    let updatedCount = 0
    for (const user of users) {
      try {
        // Handle existing settings structure
        const existingSettings = user.settings || {}
        
        // Create new settings object with template references
        const newSettings = {
          monthsFixedIncome: existingSettings.monthsFixedIncome,
          monthsVariableIncome: existingSettings.monthsVariableIncome,
          monthsNeedFixedExpenses: existingSettings.monthsNeedFixedExpenses,
          monthsNeedVariableExpenses: existingSettings.monthsNeedVariableExpenses,
          dailyTemplate: dailyDefaultTemplate.id,
          weeklyTemplate: weeklyDefaultTemplate.id
        }
        
        await prisma.user.update({
          where: { id: user.id },
          data: {
            settings: newSettings
          }
        })
        updatedCount++
        console.log(`Updated user ${user.id}`)
      } catch (error) {
        console.error(`Error updating user ${user.id}:`, error)
      }
    }
    
    console.log(`Successfully updated ${updatedCount} users`)
    
  } catch (error) {
    console.error('Error populating user template references:', error)
  } finally {
    await prisma.$disconnect()
  }
}

populateUserTemplateReferences()

