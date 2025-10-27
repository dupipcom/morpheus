const { PrismaClient } = require('../generated/prisma');

const prisma = new PrismaClient();

async function migrateUserTemplatesToTaskLists() {
  try {
    console.log('Starting migration of user templates to TaskLists...');

    // Get all users with settings
    const users = await prisma.user.findMany({
      where: {
        settings: {
          isSet: true
        }
      }
    });

    console.log(`Found ${users.length} users to process`);

    let processedCount = 0;
    let skippedCount = 0;

    for (const user of users) {
      try {
        const settings = user.settings;
        if (!settings) {
          skippedCount++;
          continue;
        }

        const dailyTemplate = settings.dailyTemplate;
        const weeklyTemplate = settings.weeklyTemplate;

        // Get the default templates
        const dailyDefaultTemplate = await prisma.template.findFirst({
          where: { role: 'daily.default' }
        });

        const weeklyDefaultTemplate = await prisma.template.findFirst({
          where: { role: 'weekly.default' }
        });

        if (!dailyDefaultTemplate || !weeklyDefaultTemplate) {
          console.log(`Skipping user ${user.id} - default templates not found`);
          skippedCount++;
          continue;
        }

        // Check if user already has TaskLists for these roles
        const existingDailyTaskList = await prisma.taskList.findFirst({
          where: {
            owners: {
              has: user.id
            },
            role: 'daily.default'
          }
        });

        const existingWeeklyTaskList = await prisma.taskList.findFirst({
          where: {
            owners: {
              has: user.id
            },
            role: 'weekly.default'
          }
        });

        // Create daily TaskList if it doesn't exist
        if (!existingDailyTaskList) {
          const dailyTasks = dailyTemplate && Array.isArray(dailyTemplate) ? dailyTemplate : dailyDefaultTemplate.tasks;
          
          await prisma.taskList.create({
            data: {
              role: 'daily.default',
              visibility: 'PRIVATE',
              owners: [user.id],
              templateId: dailyDefaultTemplate.id,
              tasks: dailyTasks,
              collaborators: [],
              managers: []
            }
          });
          console.log(`Created daily TaskList for user ${user.id}`);
        } else {
          console.log(`Daily TaskList already exists for user ${user.id}`);
        }

        // Create weekly TaskList if it doesn't exist
        if (!existingWeeklyTaskList) {
          const weeklyTasks = weeklyTemplate && Array.isArray(weeklyTemplate) ? weeklyTemplate : weeklyDefaultTemplate.tasks;
          
          await prisma.taskList.create({
            data: {
              role: 'weekly.default',
              visibility: 'PRIVATE',
              owners: [user.id],
              templateId: weeklyDefaultTemplate.id,
              tasks: weeklyTasks,
              collaborators: [],
              managers: []
            }
          });
          console.log(`Created weekly TaskList for user ${user.id}`);
        } else {
          console.log(`Weekly TaskList already exists for user ${user.id}`);
        }

        // Update user settings to remove the template fields
        const updatedSettings = {
          ...settings,
          dailyTemplate: undefined,
          weeklyTemplate: undefined
        };

        // Remove undefined fields
        Object.keys(updatedSettings).forEach(key => {
          if (updatedSettings[key] === undefined) {
            delete updatedSettings[key];
          }
        });

        await prisma.user.update({
          where: { id: user.id },
          data: {
            settings: updatedSettings
          }
        });

        processedCount++;
        console.log(`Processed user ${user.id} (${processedCount}/${users.length})`);

      } catch (error) {
        console.error(`Error processing user ${user.id}:`, error);
        skippedCount++;
      }
    }

    console.log(`\nMigration completed!`);
    console.log(`- Processed: ${processedCount} users`);
    console.log(`- Skipped: ${skippedCount} users`);

    // Verify the migration
    const taskListCount = await prisma.taskList.count({
      where: {
        role: {
          in: ['daily.default', 'weekly.default']
        }
      }
    });

    console.log(`\nVerification:`);
    console.log(`- Total TaskLists created: ${taskListCount}`);

  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the function if this script is executed directly
if (require.main === module) {
  migrateUserTemplatesToTaskLists()
    .then(() => {
      console.log('Migration script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration script failed:', error);
      process.exit(1);
    });
}

module.exports = { migrateUserTemplatesToTaskLists };
