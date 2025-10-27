const { PrismaClient } = require('../generated/prisma');

const prisma = new PrismaClient();

// Default template data from the original migration
const WEEKLY_ACTIONS = [
  { name: 'Created content for social media', area: 'social', categories: ['community'], cadence: 'weekly', status: "Not started", times: 1, count: 0 },
  { name: 'Flirted with someone', area: 'social', categories: ['affection'], cadence: 'weekly', status: "Not started", times: 1, count: 0 },
  { name: 'Talked to a friend', area: 'social', categories: ['affection'], cadence: 'weekly', status: "Not started", times: 1, count: 0 },
  { name: 'Navigated on social media', area: 'social', categories: ['community'], cadence: 'weekly', status: "Not started", times: 1, count: 0 },
  { name: 'Talked to family', area: 'social', categories: ['affection'], cadence: 'weekly', status: "Not started", times: 1, count: 0 },
  { name: 'Made music', area: 'self', categories: ['fun'], cadence: 'weekly', status: "Not started", times: 1, count: 0 },
  { name: 'Meditated', area: 'self', categories: ['spirituality'], cadence: 'weekly', status: "Not started", times: 1, count: 0 },
  { name: 'Spoke to the holy', area: 'self', categories: ['spirituality'], cadence: 'weekly', status: "Not started", times: 1, count: 0 },
  { name: 'Read a mystic book', area: 'self', categories: ['spirituality'], cadence: 'weekly', status: "Not started", times: 1, count: 0 },
  { name: 'Shared learnings', area: 'social', categories: ['community'], cadence: 'weekly', status: "Not started", times: 1, count: 0 },
  { name: 'Studied a subject', area: 'self', categories: ['growth'], cadence: 'weekly', status: "Not started", times: 1, count: 0 },
  { name: 'Watched some educational content', area: 'self', categories: ['growth'], cadence: 'weekly', status: "Not started", times: 1, count: 0 },
  { name: 'Played a game', area: 'self', categories: ['fun'], cadence: 'weekly', status: "Not started", times: 1, count: 0 },
  { name: 'Watched series or film', area: 'self', categories: ['fun'], cadence: 'weekly', status: "Not started", times: 1, count: 0 },
  { name: 'Read news', area: 'social', categories: ['community'], cadence: 'weekly', status: "Not started", times: 1, count: 0 },
  { name: 'Wrote an opinion', area: 'social', categories: ['community'], cadence: 'weekly', status: "Not started", times: 1, count: 0 },
  { name: 'Cleaned bed', area: 'home', categories: ['clean'], cadence: 'weekly', status: "Not started", times: 1, count: 0 },
  { name: 'Ensured bedroom is ordered', area: 'home', categories: ['clean'], cadence: 'weekly', status: "Not started", times: 1, count: 0 },
  { name: 'Shaved body', area: 'home', categories: ['clean', 'extra'], cadence: 'weekly', status: "Not started", times: 1, count: 0 },
  { name: 'Shaved face', area: 'home', categories: ['clean', 'extra'], cadence: 'weekly', status: "Not started", times: 1, count: 0 },
  { name: 'Cut nails', area: 'home', categories: ['clean', 'extra'], cadence: 'weekly', status: "Not started", times: 1, count: 0 },
  { name: 'Brushed surfaces', area: 'home', categories: ['clean', 'extra'], cadence: 'weekly', status: "Not started", times: 1, count: 0 },
  { name: 'Mopped floors', area: 'home', categories: ['clean', 'extra'], cadence: 'weekly', status: "Not started", times: 1, count: 0 },
  { name: 'Washed clothes', area: 'home', categories: ['clean', 'extra'], cadence: 'weekly', status: "Not started", times: 1, count: 0 },
  { name: 'Cleaned bathroom', area: 'home', categories: ['clean', 'extra'], cadence: 'weekly', status: "Not started", times: 1, count: 0 },
  { name: 'Cleaned kitchen', area: 'home', categories: ['clean', 'extra'], cadence: 'weekly', status: "Not started", times: 1, count: 0 },
  { name: 'Worked on personal project', area: 'self', categories: ['work'], cadence: 'weekly', status: "Not started", times: 1, count: 0 },
  { name: 'Helped someone', area: 'social', categories: ['community'], cadence: 'weekly', status: "Not started", times: 1, count: 0 },
  { name: 'Bought groceries', area: 'home', categories: ['maintenance'], cadence: 'weekly', status: "Not started", times: 1, count: 0 },
];

const DAILY_ACTIONS = [
  { name: 'Drank Water', area: 'self', categories: ['body'], cadence: 'daily', status: 'Not started', times: 1, count: 0 },
  { name: 'Showered', area: 'self', categories: ['body'], cadence: 'daily', status: 'Not started', times: 1, count: 0 },
  { name: 'Took meds', area: 'self', categories: ['body'], cadence: '2-daily', status: 'Not started', times: 1, count: 0 },
  { name: 'Logged mood', area: 'self', categories: ['body'], cadence: 'daily', status: 'Not started', times: 1, count: 0 },
  { name: 'Ate breakfast', area: 'self', categories: ['body'], cadence: 'daily', status: 'Not started', times: 1, count: 0 },
  { name: 'Ate lunch', area: 'self', categories: ['body'], cadence: 'daily', status: 'Not started', times: 1, count: 0 },
  { name: 'Ate dinner', area: 'self', categories: ['body'], cadence: 'daily', status: 'Not started', times: 1, count: 0 },
  { name: 'Brushed teeth', area: 'self', categories: ['body'], cadence: 'daily', status: 'Not started', times: 1, count: 0 },
  { name: 'Worked-out', area: 'self', categories: ['body'], cadence: 'daily', status: 'Not started', times: 1, count: 0 },
  { name: 'Worked', area: 'home', categories: ['work'], cadence: 'daily', status: 'Not started', times: 1, count: 0 },
  { name: 'Washed dishes', area: 'home', categories: ['clean'], cadence: 'daily', status: 'Not started', times: 1, count: 0 },
  { name: 'Stored dishes', area: 'home', categories: ['clean'], cadence: 'daily', status: 'Not started', times: 1, count: 0 },
  { name: 'Checked trash', area: 'home', categories: ['clean'], cadence: 'daily', status: 'Not started', times: 1, count: 0 },
  { name: 'Brushed floor', area: 'home', categories: ['clean'], cadence: 'daily', status: 'Not started', times: 1, count: 0 },
  { name: 'Made love', area: 'self', categories: ['body'], cadence: 'daily', status: 'Not started', times: 1, count: 0 },
  { name: 'Went out', area: 'social', categories: ['community'], cadence: 'daily', status: 'Not started', times: 1, count: 0 },
];

async function createDefaultTemplates() {
  console.log('Creating default templates...');
  
  try {
    // Check if default templates already exist
    const existingDailyTemplate = await prisma.template.findFirst({
      where: { role: 'daily.default' }
    });
    
    const existingWeeklyTemplate = await prisma.template.findFirst({
      where: { role: 'weekly.default' }
    });

    let dailyTemplateId = null;
    let weeklyTemplateId = null;

    // Create daily default template if it doesn't exist
    if (!existingDailyTemplate) {
      console.log('Creating daily default template...');
      const dailyTemplate = await prisma.template.create({
        data: {
          role: 'daily.default',
          visibility: 'PRIVATE',
          owners: [], // No specific owners for default templates
          tasks: DAILY_ACTIONS
        }
      });
      dailyTemplateId = dailyTemplate.id;
      console.log(`Created daily default template: ${dailyTemplate.id}`);
    } else {
      dailyTemplateId = existingDailyTemplate.id;
      console.log(`Daily default template already exists: ${existingDailyTemplate.id}`);
    }

    // Create weekly default template if it doesn't exist
    if (!existingWeeklyTemplate) {
      console.log('Creating weekly default template...');
      const weeklyTemplate = await prisma.template.create({
        data: {
          role: 'weekly.default',
          visibility: 'PRIVATE',
          owners: [], // No specific owners for default templates
          tasks: WEEKLY_ACTIONS
        }
      });
      weeklyTemplateId = weeklyTemplate.id;
      console.log(`Created weekly default template: ${weeklyTemplate.id}`);
    } else {
      weeklyTemplateId = existingWeeklyTemplate.id;
      console.log(`Weekly default template already exists: ${existingWeeklyTemplate.id}`);
    }

    // Get all users and update their settings to reference the default templates
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

    console.log(`\nUpdating ${users.length} users to reference default templates...`);

    let updatedUsers = 0;
    for (const user of users) {
      const settings = user.settings;
      if (!settings) continue;

      const updates = {};
      let needsUpdate = false;

      // Update dailyTemplateId if it's missing or null
      if (!settings.dailyTemplateId) {
        updates.dailyTemplateId = dailyTemplateId;
        needsUpdate = true;
      }

      // Update weeklyTemplateId if it's missing or null
      if (!settings.weeklyTemplateId) {
        updates.weeklyTemplateId = weeklyTemplateId;
        needsUpdate = true;
      }

      // Update user settings if needed
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

        updatedUsers++;
        console.log(`Updated user ${user.id} with default template references`);
      }
    }

    console.log(`\nMigration completed successfully!`);
    console.log(`- Daily default template: ${dailyTemplateId}`);
    console.log(`- Weekly default template: ${weeklyTemplateId}`);
    console.log(`- Updated ${updatedUsers} users`);

  } catch (error) {
    console.error('Error during template creation:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the migration
createDefaultTemplates()
  .then(() => {
    console.log('Default template creation completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Default template creation failed:', error);
    process.exit(1);
  });



