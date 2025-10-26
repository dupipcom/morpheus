const { PrismaClient } = require('../generated/prisma');

const prisma = new PrismaClient();

async function cleanupOrphanedTemplateIds() {
  console.log('Cleaning up orphaned template ID references...');
  
  try {
    // Get all users with settings
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

    console.log(`Found ${users.length} users with settings`);

    let cleanedCount = 0;

    for (const user of users) {
      const settings = user.settings;
      if (!settings) continue;

      const updates = {};
      let needsUpdate = false;

      // Check dailyTemplateId
      if (settings.dailyTemplateId) {
        const template = await prisma.template.findUnique({
          where: { id: settings.dailyTemplateId }
        });
        if (!template) {
          console.log(`User ${user.id} has orphaned dailyTemplateId: ${settings.dailyTemplateId}`);
          updates.dailyTemplateId = undefined;
          needsUpdate = true;
        }
      }

      // Check weeklyTemplateId
      if (settings.weeklyTemplateId) {
        const template = await prisma.template.findUnique({
          where: { id: settings.weeklyTemplateId }
        });
        if (!template) {
          console.log(`User ${user.id} has orphaned weeklyTemplateId: ${settings.weeklyTemplateId}`);
          updates.weeklyTemplateId = undefined;
          needsUpdate = true;
        }
      }

      // Update user settings to remove orphaned references
      if (needsUpdate) {
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

        console.log(`Cleaned up settings for user ${user.id}`);
        cleanedCount++;
      }
    }

    console.log(`\nCleanup completed! Cleaned ${cleanedCount} users.`);

  } catch (error) {
    console.error('Error during cleanup:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the cleanup
cleanupOrphanedTemplateIds()
  .then(() => {
    console.log('Cleanup script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Cleanup script failed:', error);
    process.exit(1);
  });


