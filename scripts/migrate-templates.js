const { PrismaClient } = require('../generated/prisma');

const prisma = new PrismaClient();

async function migrateTemplates() {
  console.log('Starting template migration...');
  
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

    // Filter users who actually have templates
    const usersWithTemplates = users.filter(user => {
      const settings = user.settings;
      if (!settings) return false;
      
      const hasDailyTemplate = settings.dailyTemplate && Array.isArray(settings.dailyTemplate) && settings.dailyTemplate.length > 0;
      const hasWeeklyTemplate = settings.weeklyTemplate && Array.isArray(settings.weeklyTemplate) && settings.weeklyTemplate.length > 0;
      
      return hasDailyTemplate || hasWeeklyTemplate;
    });

    console.log(`Found ${usersWithTemplates.length} users with templates to migrate`);

    for (const user of usersWithTemplates) {
      const settings = user.settings;
      if (!settings) continue;

      const updates = {};

      // Migrate dailyTemplate
      if (settings.dailyTemplate && Array.isArray(settings.dailyTemplate) && settings.dailyTemplate.length > 0) {
        console.log(`Migrating daily template for user ${user.id}`);
        
        const dailyTemplate = await prisma.template.create({
          data: {
            role: 'default.daily',
            visibility: 'PRIVATE',
            owners: [user.id],
            tasks: settings.dailyTemplate
          }
        });

        updates.dailyTemplateId = dailyTemplate.id;
        console.log(`Created daily template ${dailyTemplate.id} for user ${user.id}`);
      }

      // Migrate weeklyTemplate
      if (settings.weeklyTemplate && Array.isArray(settings.weeklyTemplate) && settings.weeklyTemplate.length > 0) {
        console.log(`Migrating weekly template for user ${user.id}`);
        
        const weeklyTemplate = await prisma.template.create({
          data: {
            role: 'default.weekly',
            visibility: 'PRIVATE',
            owners: [user.id],
            tasks: settings.weeklyTemplate
          }
        });

        updates.weeklyTemplateId = weeklyTemplate.id;
        console.log(`Created weekly template ${weeklyTemplate.id} for user ${user.id}`);
      }

      // Update user settings to reference the new template IDs
      if (Object.keys(updates).length > 0) {
        const newSettings = {
          ...settings,
          ...updates,
          // Remove the old template arrays
          dailyTemplate: undefined,
          weeklyTemplate: undefined
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

    console.log('Template migration completed successfully!');
  } catch (error) {
    console.error('Error during template migration:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the migration
migrateTemplates()
  .then(() => {
    console.log('Migration script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration script failed:', error);
    process.exit(1);
  });
