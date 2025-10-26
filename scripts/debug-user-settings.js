const { PrismaClient } = require('../generated/prisma');

const prisma = new PrismaClient();

async function debugUserSettings() {
  console.log('Debugging user settings...');
  
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

    console.log(`Found ${users.length} users with settings\n`);

    for (const user of users) {
      const settings = user.settings;
      console.log(`=== User ${user.id} ===`);
      console.log('Settings keys:', Object.keys(settings || {}));
      
      if (settings) {
        console.log('dailyTemplate exists:', !!settings.dailyTemplate);
        console.log('dailyTemplate type:', typeof settings.dailyTemplate);
        console.log('dailyTemplate is array:', Array.isArray(settings.dailyTemplate));
        console.log('dailyTemplate length:', settings.dailyTemplate?.length || 0);
        
        console.log('weeklyTemplate exists:', !!settings.weeklyTemplate);
        console.log('weeklyTemplate type:', typeof settings.weeklyTemplate);
        console.log('weeklyTemplate is array:', Array.isArray(settings.weeklyTemplate));
        console.log('weeklyTemplate length:', settings.weeklyTemplate?.length || 0);
        
        if (settings.dailyTemplate && Array.isArray(settings.dailyTemplate) && settings.dailyTemplate.length > 0) {
          console.log('Daily template tasks:');
          settings.dailyTemplate.forEach((task, index) => {
            console.log(`  ${index + 1}. ${task.name || task.id || 'unnamed'} (${task.status || 'no status'})`);
          });
        }
        
        if (settings.weeklyTemplate && Array.isArray(settings.weeklyTemplate) && settings.weeklyTemplate.length > 0) {
          console.log('Weekly template tasks:');
          settings.weeklyTemplate.forEach((task, index) => {
            console.log(`  ${index + 1}. ${task.name || task.id || 'unnamed'} (${task.status || 'no status'})`);
          });
        }
      }
      console.log(''); // Empty line for readability
    }

  } catch (error) {
    console.error('Error during debug:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the debug
debugUserSettings()
  .then(() => {
    console.log('Debug completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Debug failed:', error);
    process.exit(1);
  });
