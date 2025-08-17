/**
 * PRISMA DATA MIGRATION SCRIPT (JavaScript ESM Version)
 * -----------------------------
 *
 * Purpose:
 * This script populates the `settings.weeklyTemplate` and `settings.dailyTemplate`
 * fields for all documents in the 'users' collection.
 *
 * How to Run:
 * 1. Ensure your `package.json` has `"type": "module"`.
 * 2. Save this file in your Prisma project (e.g., in a `scripts` folder).
 * 3. Run the script from your terminal: `node path/to/this/script.js`
 *
 * IMPORTANT:
 * ALWAYS back up your database before running a migration script.
 */

const { PrismaClient } = require('../../generated/prisma')

// Logger helper function for consistent console logging format
const logger = (str, originalMessage) => {
  // Convert objects to strings to avoid circular references
  let message = str;
  if (originalMessage !== undefined) {
    if (typeof originalMessage === 'object') {
      try {
        message = `${str} - ${JSON.stringify(originalMessage, null, 2)}`;
      } catch (error) {
        message = `${str} - [Object - circular reference or non-serializable]`;
      }
    } else {
      message = `${str} - ${String(originalMessage)}`;
    }
  }

  // Determine colors based on message content
  const isDb = str.includes('db');
  const isError = str.includes('error');
  const isIdle = str.includes('idle');
  const isWarning = str.includes('warning');

  // Create console.log color settings object
  const colorSettings = {
    background: isDb ? 'cyan' : '#1f1f1f',
    color: isError ? 'red' : isIdle || isWarning ? 'yellow' : 'green',
    fontWeight: 'bold',
    padding: '2px 4px',
    borderRadius: '3px'
  };

  console.log(
    `%cdpip::morpheus::${message}`,
    `background: ${colorSettings.background}; color: ${colorSettings.color}; font-weight: ${colorSettings.fontWeight}; padding: ${colorSettings.padding}; border-radius: ${colorSettings.borderRadius};`
  );
};

// --- Template Data ---

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


// Instantiate Prisma Client
const prisma = new PrismaClient();

/**
 * The main migration function.
 */
async function main() {
  logger('migration_start', 'Started');

  // 1. Fetch all documents from the 'users' collection.
  const documents = await prisma.user.findMany();
  logger('migration_documents_found', `Found ${documents.length} documents`);

  let updatedCount = 0;
  const updatePromises = [];

  // 2. Loop through each document to modify it in memory.
  for (const doc of documents) {
    // The `settings` field is assumed to be of type `Json` in your schema.prisma
    // e.g., `settings   Json?`
    const settings = doc.settings || {};
    let wasModified = false;

    // 3. Populate `weeklyTemplate` if it doesn't exist or is empty.
    if (!settings.weeklyTemplate || settings.weeklyTemplate.length === 0) {
      settings.weeklyTemplate = WEEKLY_ACTIONS;
      wasModified = true;
      logger('migration_add_weekly_template', 'Added weekly template');
    }

    // 4. Populate `dailyTemplate` if it doesn't exist or is empty.
    if (!settings.dailyTemplate || settings.dailyTemplate.length === 0) {
        settings.dailyTemplate = DAILY_ACTIONS;
        wasModified = true;
        logger('migration_add_daily_template', 'Added daily template');
    }

    // 5. If the document was changed, add its update operation to our list of promises.
    if (wasModified) {
      updatedCount++;
      const updatePromise = prisma.user.update({
        where: { id: doc.id },
        data: {
          // Prisma's JSON update requires you to pass the entire modified object.
          settings: settings,
        },
      });
      updatePromises.push(updatePromise);
    }
  }

  // 6. Execute all update promises in a single transaction.
  if (updatePromises.length > 0) {
    logger('migration_applying_updates', `Applying ${updatedCount} updates`);
    await prisma.$transaction(updatePromises);
    logger('migration_success', 'Completed');
  } else {
    logger('migration_complete', 'No updates needed');
  }
}

// 7. Execute the main function and handle potential errors.
main()
  .catch((e) => {
    console.error('Migration failed:');
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    // 8. Ensure the Prisma Client disconnects after the script finishes.
    await prisma.$disconnect();
  });
