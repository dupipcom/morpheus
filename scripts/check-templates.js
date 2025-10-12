const { PrismaClient } = require('../generated/prisma');

const prisma = new PrismaClient();

async function checkTemplates() {
  console.log('Checking existing templates...');
  
  try {
    // Get all templates
    const templates = await prisma.template.findMany({
      select: {
        id: true,
        role: true,
        owners: true,
        tasks: true,
        createdAt: true
      }
    });

    console.log(`Found ${templates.length} templates in the database\n`);

    if (templates.length > 0) {
      for (const template of templates) {
        console.log(`=== Template ${template.id} ===`);
        console.log(`Role: ${template.role}`);
        console.log(`Owners: ${template.owners.join(', ')}`);
        console.log(`Tasks count: ${template.tasks.length}`);
        console.log(`Created: ${template.createdAt}`);
        
        if (template.tasks.length > 0) {
          console.log('Tasks:');
          template.tasks.forEach((task, index) => {
            console.log(`  ${index + 1}. ${task.name || task.id || 'unnamed'} (${task.status || 'no status'})`);
          });
        }
        console.log(''); // Empty line for readability
      }
    } else {
      console.log('No templates found in the database.');
    }

    // Check if any users have template IDs that don't exist
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

    console.log(`\nChecking ${users.length} users for orphaned template references...`);
    
    let orphanedCount = 0;
    for (const user of users) {
      const settings = user.settings;
      if (!settings) continue;
      
      if (settings.dailyTemplateId) {
        const template = await prisma.template.findUnique({
          where: { id: settings.dailyTemplateId }
        });
        if (!template) {
          console.log(`User ${user.id} has orphaned dailyTemplateId: ${settings.dailyTemplateId}`);
          orphanedCount++;
        }
      }
      
      if (settings.weeklyTemplateId) {
        const template = await prisma.template.findUnique({
          where: { id: settings.weeklyTemplateId }
        });
        if (!template) {
          console.log(`User ${user.id} has orphaned weeklyTemplateId: ${settings.weeklyTemplateId}`);
          orphanedCount++;
        }
      }
    }
    
    if (orphanedCount === 0) {
      console.log('No orphaned template references found.');
    } else {
      console.log(`Found ${orphanedCount} orphaned template references.`);
    }

  } catch (error) {
    console.error('Error during check:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the check
checkTemplates()
  .then(() => {
    console.log('Check completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Check failed:', error);
    process.exit(1);
  });
