/**
 * PRISMA DATA MIGRATION SCRIPT (JavaScript ESM Version)
 * -----------------------------
 *
 * Purpose:
 * This script adds new key-value pairs to each object within a nested array
 * in the 'users' collection.
 *
 * Target Path:
 * `entries.2025.weeks[<week_of_the_year>].tasks`
 *
 * Fields to Add:
 * - times: 1
 * - count: 0
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

// Instantiate Prisma Client
const prisma = new PrismaClient();

/**
 * The main migration function.
 */
async function main() {
  logger('migration_start', 'Started');

  // 1. Fetch all documents from the target collection.
  //    This now targets the `user` model, corresponding to your `users` collection.
  const documents = await prisma.user.findMany();
  logger('migration_documents_found', `Found ${documents.length} documents`);

  let updatedCount = 0;
  const updatePromises = [];

  // 2. Loop through each document to modify it in memory.
  for (const doc of documents) {
    // The `entries` field is assumed to be of type `Json` in your schema.prisma
    // e.g., `entries   Json`
    const entries = doc.entries;
    let wasModified = false;

    // 3. Navigate safely to the target data structure.
    const yearData = entries?.['2025'];
    const weeks = yearData?.weeks; // UPDATED: Target 'weeks' instead of 'days'

    if (!weeks) {
      // If there's no `weeks` object for 2025, skip to the next document.
      continue;
    }

    // 4. Iterate over all the weeks within the 'weeks' object.
    for (const weekKey in weeks) {
      if (Object.prototype.hasOwnProperty.call(weeks, weekKey)) {
        const weekData = weeks[weekKey];
        const tasks = weekData?.tasks;

        // 5. Check if `tasks` is a non-empty array.
        if (tasks && Array.isArray(tasks) && tasks.length > 0) {
          // 6. Iterate over each task and add the new key-value pairs.
          for (const task of tasks) {
            if (typeof task === 'object' && task !== null && !Array.isArray(task)) {
              const taskObj = task;
              let taskWasModified = false;

              // Add the 'times' key if it doesn't already exist.
              if (taskObj['times'] === undefined) {
                taskObj['times'] = 1; // Set to the number 1
                taskWasModified = true;
              }

              // Add the 'count' key if it doesn't already exist.
              if (taskObj['count'] === undefined) {
                taskObj['count'] = 0;
                taskWasModified = true;
              }
              
              if (taskWasModified) {
                wasModified = true;
              }
            }
          }
        }
      }
    }

    // 7. If the document was changed, add its update operation to our list of promises.
    if (wasModified) {
      updatedCount++;
      const updatePromise = prisma.user.update({
        where: { id: doc.id },
        data: {
          // Prisma's JSON update requires you to pass the entire modified object.
          entries: entries,
        },
      });
      updatePromises.push(updatePromise);
      logger('migration_document_update', 'Document updated');
    }
  }

  // 8. Execute all update promises in a single transaction.
  if (updatePromises.length > 0) {
    logger('migration_applying_updates', `Applying ${updatedCount} updates`);
    await prisma.$transaction(updatePromises);
    logger('migration_success', 'Completed');
  } else {
    logger('migration_complete', 'No updates needed');
  }
}

// 9. Execute the main function and handle potential errors.
main()
  .catch((e) => {
    console.error('Migration failed:');
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    // 10. Ensure the Prisma Client disconnects after the script finishes.
    await prisma.$disconnect();
  });
