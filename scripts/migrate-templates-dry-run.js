const { PrismaClient } = require('../generated/prisma');

const prisma = new PrismaClient();

async function dryRunMigration() {
  console.log('Starting DRY RUN template migration...');
  
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

    let dailyTemplateCount = 0;
    let weeklyTemplateCount = 0;

    for (const user of usersWithTemplates) {
      const settings = user.settings;
      if (!settings) continue;

      // Check dailyTemplate
      if (settings.dailyTemplate && Array.isArray(settings.dailyTemplate) && settings.dailyTemplate.length > 0) {
        dailyTemplateCount++;
        console.log(`User ${user.id} has daily template with ${settings.dailyTemplate.length} tasks`);
        console.log(`  Tasks:`, settings.dailyTemplate.map(t => t.name || t.id || 'unnamed').join(', '));
      }

      // Check weeklyTemplate
      if (settings.weeklyTemplate && Array.isArray(settings.weeklyTemplate) && settings.weeklyTemplate.length > 0) {
        weeklyTemplateCount++;
        console.log(`User ${user.id} has weekly template with ${settings.weeklyTemplate.length} tasks`);
        console.log(`  Tasks:`, settings.weeklyTemplate.map(t => t.name || t.id || 'unnamed').join(', '));
      }
    }

    console.log('\n=== DRY RUN SUMMARY ===');
    console.log(`Total users: ${users.length}`);
    console.log(`Users with daily templates: ${dailyTemplateCount}`);
    console.log(`Users with weekly templates: ${weeklyTemplateCount}`);
    console.log(`Total templates to create: ${dailyTemplateCount + weeklyTemplateCount}`);
    console.log('\nThis was a DRY RUN - no data was modified.');

  } catch (error) {
    console.error('Error during dry run:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the dry run
dryRunMigration()
  .then(() => {
    console.log('Dry run completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Dry run failed:', error);
    process.exit(1);
  });
