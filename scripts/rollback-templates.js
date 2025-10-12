const { PrismaClient } = require('../generated/prisma');

const prisma = new PrismaClient();

async function rollbackTemplates() {
  console.log('Starting template rollback...');
  
  try {
    // Get all users with template IDs in their settings
    const users = await prisma.user.findMany({
      where: {
        settings: {
          isSet: true
        }
      },
      select: {
        id: true,
        settings: true
      }
    });

    console.log(`Found ${users.length} users to process`);

    for (const user of users) {
      const settings = user.settings;
      if (!settings) continue;

      const updates = {};

      // Restore dailyTemplate from template
      if (settings.dailyTemplateId) {
        console.log(`Rolling back daily template for user ${user.id}`);
        
        const dailyTemplate = await prisma.template.findUnique({
          where: { id: settings.dailyTemplateId }
        });

        if (dailyTemplate) {
          updates.dailyTemplate = dailyTemplate.tasks;
          updates.dailyTemplateId = undefined;
          
          // Delete the template
          await prisma.template.delete({
            where: { id: settings.dailyTemplateId }
          });
          
          console.log(`Restored and deleted daily template ${settings.dailyTemplateId} for user ${user.id}`);
        }
      }

      // Restore weeklyTemplate from template
      if (settings.weeklyTemplateId) {
        console.log(`Rolling back weekly template for user ${user.id}`);
        
        const weeklyTemplate = await prisma.template.findUnique({
          where: { id: settings.weeklyTemplateId }
        });

        if (weeklyTemplate) {
          updates.weeklyTemplate = weeklyTemplate.tasks;
          updates.weeklyTemplateId = undefined;
          
          // Delete the template
          await prisma.template.delete({
            where: { id: settings.weeklyTemplateId }
          });
          
          console.log(`Restored and deleted weekly template ${settings.weeklyTemplateId} for user ${user.id}`);
        }
      }

      // Update user settings to restore the old format
      if (Object.keys(updates).length > 0) {
        const newSettings = {
          ...settings,
          ...updates
        };

        await prisma.user.update({
          where: { id: user.id },
          data: {
            settings: newSettings
          }
        });

        console.log(`Updated settings for user ${user.id}`);
      }
    }

    console.log('Template rollback completed successfully!');
  } catch (error) {
    console.error('Error during template rollback:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the rollback
rollbackTemplates()
  .then(() => {
    console.log('Rollback script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Rollback script failed:', error);
    process.exit(1);
  });
