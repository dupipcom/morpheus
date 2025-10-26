const { PrismaClient } = require('../generated/prisma');

const prisma = new PrismaClient();

function inferTimeframeFromRole(role) {
  if (!role || typeof role !== 'string') return undefined;
  const r = role.toLowerCase();
  if (r.includes('daily')) return 'daily';
  if (r.includes('weekly')) return 'weekly';
  return undefined;
}

async function addNamesToTaskLists() {
  const lists = await prisma.taskList.findMany({ select: { id: true, role: true, name: true } });
  let updated = 0;
  for (const list of lists) {
    if (!list.name || !list.name.trim()) {
      const timeframe = inferTimeframeFromRole(list.role) || 'custom';
      const defaultName = timeframe === 'daily'
        ? 'My daily list'
        : timeframe === 'weekly'
          ? 'My weekly list'
          : 'My custom list';
      await prisma.taskList.update({ where: { id: list.id }, data: { name: defaultName } });
      updated += 1;
    }
  }
  return updated;
}

async function addNamesToTemplates() {
  const templates = await prisma.template.findMany({ select: { id: true, role: true, name: true } });
  let updated = 0;
  for (const tpl of templates) {
    if (!tpl.name || !tpl.name.trim()) {
      const timeframe = inferTimeframeFromRole(tpl.role) || 'custom';
      const defaultName = timeframe === 'daily'
        ? 'My daily template'
        : timeframe === 'weekly'
          ? 'My weekly template'
          : 'My custom template';
      await prisma.template.update({ where: { id: tpl.id }, data: { name: defaultName } });
      updated += 1;
    }
  }
  return updated;
}

async function main() {
  try {
    console.log('Adding default names to TaskLists and Templates...');
    const listsUpdated = await addNamesToTaskLists();
    const templatesUpdated = await addNamesToTemplates();
    console.log(`Updated ${listsUpdated} task lists and ${templatesUpdated} templates.`);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();


