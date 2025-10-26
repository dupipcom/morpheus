const { PrismaClient } = require('../generated/prisma');

const prisma = new PrismaClient();

async function verifyMigration() {
  try {
    console.log('Verifying migration results...\n');

    // Count TaskLists by role
    const dailyTaskLists = await prisma.taskList.count({
      where: { role: 'daily.default' }
    });

    const weeklyTaskLists = await prisma.taskList.count({
      where: { role: 'weekly.default' }
    });

    console.log(`TaskLists created:`);
    console.log(`- Daily default: ${dailyTaskLists}`);
    console.log(`- Weekly default: ${weeklyTaskLists}`);
    console.log(`- Total: ${dailyTaskLists + weeklyTaskLists}\n`);

    // Show sample TaskLists
    const sampleDaily = await prisma.taskList.findFirst({
      where: { role: 'daily.default' },
      include: { template: true }
    });

    const sampleWeekly = await prisma.taskList.findFirst({
      where: { role: 'weekly.default' },
      include: { template: true }
    });

    if (sampleDaily) {
      console.log(`Sample Daily TaskList:`);
      console.log(`- ID: ${sampleDaily.id}`);
      console.log(`- Owners: ${sampleDaily.owners.length}`);
      console.log(`- Tasks: ${sampleDaily.tasks.length}`);
      console.log(`- Template ID: ${sampleDaily.templateId}`);
      console.log(`- Created: ${sampleDaily.createdAt}\n`);
    }

    if (sampleWeekly) {
      console.log(`Sample Weekly TaskList:`);
      console.log(`- ID: ${sampleWeekly.id}`);
      console.log(`- Owners: ${sampleWeekly.owners.length}`);
      console.log(`- Tasks: ${sampleWeekly.tasks.length}`);
      console.log(`- Template ID: ${sampleWeekly.templateId}`);
      console.log(`- Created: ${sampleWeekly.createdAt}\n`);
    }

    // Check if any users still have template fields in settings
    const usersWithTemplates = await prisma.user.findMany({
      where: {
        settings: {
          isSet: true
        }
      }
    });

    let usersWithOldTemplates = 0;
    for (const user of usersWithTemplates) {
      if (user.settings && (user.settings.dailyTemplate || user.settings.weeklyTemplate)) {
        usersWithOldTemplates++;
      }
    }

    console.log(`Users with old template fields in settings: ${usersWithOldTemplates}`);

    if (usersWithOldTemplates === 0) {
      console.log('✅ Migration completed successfully - no users have old template fields!');
    } else {
      console.log('⚠️  Some users still have old template fields in settings');
    }

  } catch (error) {
    console.error('Verification failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the function if this script is executed directly
if (require.main === module) {
  verifyMigration()
    .then(() => {
      console.log('\nVerification completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Verification failed:', error);
      process.exit(1);
    });
}

module.exports = { verifyMigration };
