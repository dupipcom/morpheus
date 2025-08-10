/**
 * PRISMA DATA MIGRATION SCRIPT (JavaScript Version)
 * -----------------------------
 *
 * Purpose:
 * This script adds new key-value pairs to each object within a nested array
 * in the 'users' collection.
 *
 * Target Path:
 * `entries.2025.days[<any_date>].tasks`
 *
 * Fields to Add:
 * - times: 1
 * - count: 0
 *
 * How to Run:
 * 1. Save this file in your Prisma project (e.g., in a `scripts` folder).
 * 2. Run the script from your terminal: `node path/to/this/script.js`
 *
 * IMPORTANT:
 * ALWAYS back up your database before running a migration script.
 */

const { PrismaClient } = require('../../generated/prisma')

// Instantiate Prisma Client
const prisma = new PrismaClient();

/**
 * The main migration function.
 */
async function main() {
  console.log('Starting migration for the "users" collection...');

  // 1. Fetch all documents from the target collection.
  //    This now targets the `user` model, corresponding to your `users` collection.
  const documents = await prisma.user.findMany();
  console.log(`Found ${documents.length} documents to process.`);

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
    const days = yearData?.days;

    if (!days) {
      // If there's no `days` object for 2025, skip to the next document.
      continue;
    }

    // 4. Iterate over all the dates within the 'days' object.
    for (const dateKey in days) {
      if (Object.prototype.hasOwnProperty.call(days, dateKey)) {
        const dayData = days[dateKey];
        const tasks = dayData?.tasks;

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
      console.log(`- Document with ID '${doc.id}' will be updated.`);
    }
  }

  // 8. Execute all update promises in a single transaction.
  if (updatePromises.length > 0) {
    console.log(`\nApplying updates to ${updatedCount} documents...`);
    await prisma.$transaction(updatePromises);
    console.log('✅ Migration successful: All documents have been updated.');
  } else {
    console.log('✅ Migration complete: No documents required updates.');
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
