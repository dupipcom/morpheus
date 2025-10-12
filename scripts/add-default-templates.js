const { PrismaClient } = require('../generated/prisma');

const prisma = new PrismaClient();

async function addDefaultTemplates() {
  try {
    console.log('Adding default templates...');

    // Daily template data
    const dailyTemplate = [
      {
        name: "Drank Water",
        categories: ["body"],
        area: "self",
        status: "Not started",
        cadence: "daily",
        times: 1,
        count: 0
      },
      {
        name: "Showered",
        categories: ["body"],
        area: "self",
        status: "Not started",
        cadence: "daily",
        times: 1,
        count: 0
      },
      {
        name: "Took meds",
        categories: ["body"],
        area: "self",
        status: "Not started",
        cadence: "2-daily",
        times: 1,
        count: 0
      },
      {
        name: "Logged mood",
        categories: ["body"],
        area: "self",
        status: "Not started",
        cadence: "daily",
        times: 1,
        count: 0
      },
      {
        name: "Ate breakfast",
        categories: ["body"],
        area: "self",
        status: "Not started",
        cadence: "daily",
        times: 1,
        count: 0
      },
      {
        name: "Ate lunch",
        categories: ["body"],
        area: "self",
        status: "Not started",
        cadence: "daily",
        times: 1,
        count: 0
      },
      {
        name: "Ate dinner",
        categories: ["body"],
        area: "self",
        status: "Not started",
        cadence: "daily",
        times: 1,
        count: 0
      },
      {
        name: "Brushed teeth",
        categories: ["body"],
        area: "self",
        status: "Not started",
        cadence: "daily",
        times: 1,
        count: 0
      },
      {
        name: "Worked-out",
        categories: ["body"],
        area: "self",
        status: "Not started",
        cadence: "daily",
        times: 1,
        count: 0
      },
      {
        name: "Worked",
        categories: ["work"],
        area: "home",
        status: "Not started",
        cadence: "daily",
        times: 1,
        count: 0
      },
      {
        name: "Washed dishes",
        categories: ["clean"],
        area: "home",
        status: "Not started",
        cadence: "daily",
        times: 1,
        count: 0
      },
      {
        name: "Stored dishes",
        categories: ["clean"],
        area: "home",
        status: "Not started",
        cadence: "daily",
        times: 1,
        count: 0
      },
      {
        name: "Checked trash",
        categories: ["clean"],
        area: "home",
        status: "Not started",
        cadence: "daily",
        times: 1,
        count: 0
      },
      {
        name: "Brushed floor",
        categories: ["clean"],
        area: "home",
        status: "Not started",
        cadence: "daily",
        times: 1,
        count: 0
      },
      {
        name: "Made love",
        categories: ["body"],
        area: "self",
        status: "Not started",
        cadence: "daily",
        times: 1,
        count: 0
      },
      {
        name: "Went out",
        categories: ["community"],
        area: "social",
        status: "Not started",
        cadence: "daily",
        times: 1,
        count: 0
      }
    ];

    // Weekly template data
    const weeklyTemplate = [
      {
        name: "Created content for social media",
        categories: ["community"],
        area: "social",
        status: "Not started",
        cadence: "weekly",
        times: 1,
        count: 0
      },
      {
        name: "Flirted with someone",
        categories: ["affection"],
        area: "social",
        status: "Not started",
        cadence: "weekly",
        times: 1,
        count: 0
      },
      {
        name: "Talked to a friend",
        categories: ["affection"],
        area: "social",
        status: "Not started",
        cadence: "weekly",
        times: 1,
        count: 0
      },
      {
        name: "Navigated on social media",
        categories: ["community"],
        area: "social",
        status: "Not started",
        cadence: "weekly",
        times: 1,
        count: 0
      },
      {
        name: "Talked to family",
        categories: ["affection"],
        area: "social",
        status: "Not started",
        cadence: "weekly",
        times: 1,
        count: 0
      },
      {
        name: "Made music",
        categories: ["fun"],
        area: "self",
        status: "Not started",
        cadence: "weekly",
        times: 1,
        count: 0
      },
      {
        name: "Meditated",
        categories: ["spirituality"],
        area: "self",
        status: "Not started",
        cadence: "weekly",
        times: 1,
        count: 0
      },
      {
        name: "Spoke to the holy",
        categories: ["spirituality"],
        area: "self",
        status: "Not started",
        cadence: "weekly",
        times: 1,
        count: 0
      },
      {
        name: "Read a mystic book",
        categories: ["spirituality"],
        area: "self",
        status: "Not started",
        cadence: "weekly",
        times: 1,
        count: 0
      },
      {
        name: "Shared learnings",
        categories: ["community"],
        area: "social",
        status: "Not started",
        cadence: "weekly",
        times: 1,
        count: 0
      },
      {
        name: "Studied a subject",
        categories: ["growth"],
        area: "self",
        status: "Not started",
        cadence: "weekly",
        times: 1,
        count: 0
      },
      {
        name: "Watched some educational content",
        categories: ["growth"],
        area: "self",
        status: "Not started",
        cadence: "weekly",
        times: 1,
        count: 0
      },
      {
        name: "Played a game",
        categories: ["fun"],
        area: "self",
        status: "Not started",
        cadence: "weekly",
        times: 1,
        count: 0
      },
      {
        name: "Watched series or film",
        categories: ["fun"],
        area: "self",
        status: "Not started",
        cadence: "weekly",
        times: 1,
        count: 0
      },
      {
        name: "Read news",
        categories: ["community"],
        area: "social",
        status: "Not started",
        cadence: "weekly",
        times: 1,
        count: 0
      },
      {
        name: "Wrote an opinion",
        categories: ["community"],
        area: "social",
        status: "Not started",
        cadence: "weekly",
        times: 1,
        count: 0
      },
      {
        name: "Cleaned bed",
        categories: ["clean"],
        area: "home",
        status: "Not started",
        cadence: "weekly",
        times: 1,
        count: 0
      },
      {
        name: "Ensured bedroom is ordered",
        categories: ["clean"],
        area: "home",
        status: "Not started",
        cadence: "weekly",
        times: 1,
        count: 0
      },
      {
        name: "Shaved body",
        categories: ["clean", "extra"],
        area: "home",
        status: "Not started",
        cadence: "weekly",
        times: 1,
        count: 0
      },
      {
        name: "Shaved face",
        categories: ["clean", "extra"],
        area: "home",
        status: "Not started",
        cadence: "weekly",
        times: 1,
        count: 0
      },
      {
        name: "Cut nails",
        categories: ["clean", "extra"],
        area: "home",
        status: "Not started",
        cadence: "weekly",
        times: 1,
        count: 0
      },
      {
        name: "Brushed surfaces",
        categories: ["clean", "extra"],
        area: "home",
        status: "Not started",
        cadence: "weekly",
        times: 1,
        count: 0
      },
      {
        name: "Mopped floors",
        categories: ["clean", "extra"],
        area: "home",
        status: "Not started",
        cadence: "weekly",
        times: 1,
        count: 0
      },
      {
        name: "Washed clothes",
        categories: ["clean", "extra"],
        area: "home",
        status: "Not started",
        cadence: "weekly",
        times: 1,
        count: 0
      },
      {
        name: "Cleaned bathroom",
        categories: ["clean", "extra"],
        area: "home",
        status: "Not started",
        cadence: "weekly",
        times: 1,
        count: 0
      },
      {
        name: "Cleaned kitchen",
        categories: ["clean", "extra"],
        area: "home",
        status: "Not started",
        cadence: "weekly",
        times: 1,
        count: 0
      }
    ];

    // Check if templates already exist
    const existingDaily = await prisma.template.findFirst({
      where: { role: 'daily.default' }
    });

    const existingWeekly = await prisma.template.findFirst({
      where: { role: 'weekly.default' }
    });

    if (existingDaily) {
      console.log('Daily default template already exists, updating...');
      await prisma.template.update({
        where: { id: existingDaily.id },
        data: {
          tasks: dailyTemplate,
          updatedAt: new Date()
        }
      });
      console.log('Daily default template updated successfully');
    } else {
      console.log('Creating daily default template...');
      await prisma.template.create({
        data: {
          role: 'daily.default',
          visibility: 'PUBLIC',
          tasks: dailyTemplate,
          owners: []
        }
      });
      console.log('Daily default template created successfully');
    }

    if (existingWeekly) {
      console.log('Weekly default template already exists, updating...');
      await prisma.template.update({
        where: { id: existingWeekly.id },
        data: {
          tasks: weeklyTemplate,
          updatedAt: new Date()
        }
      });
      console.log('Weekly default template updated successfully');
    } else {
      console.log('Creating weekly default template...');
      await prisma.template.create({
        data: {
          role: 'weekly.default',
          visibility: 'PUBLIC',
          tasks: weeklyTemplate,
          owners: []
        }
      });
      console.log('Weekly default template created successfully');
    }

    console.log('All default templates processed successfully!');

  } catch (error) {
    console.error('Error adding default templates:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the function if this script is executed directly
if (require.main === module) {
  addDefaultTemplates()
    .then(() => {
      console.log('Script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Script failed:', error);
      process.exit(1);
    });
}

module.exports = { addDefaultTemplates };
