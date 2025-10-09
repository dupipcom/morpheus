/**
 * PRISMA DATA MIGRATION SCRIPT (JavaScript Version)
 * -----------------------------
 *
 * Purpose:
 * This script backfills ticker values for existing day and week entries
 * by calculating the percentage delta between current and previous periods.
 *
 * Target Path:
 * `entries.<year>.days[<date>].ticker`
 * `entries.<year>.weeks[<week>].ticker`
 *
 * Fields to Add:
 * - ticker: calculated percentage delta from previous period
 *
 * How to Run:
 * 1. Save this file in your Prisma project (e.g., in a `scripts` folder).
 * 2. Run the script from your terminal: `node path/to/this/script.js`
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
 * Calculates the percentage delta between current and previous values
 */
function calculatePercentageDelta(currentValue, previousValue) {
  if (previousValue === 0) {
    return currentValue > 0 ? 100 : 0;
  }
  return ((currentValue - previousValue) / previousValue) * 100;
}

/**
 * Gets the previous day's earnings and availableBalance for ticker calculation
 */
function getPreviousDayData(entries, year, currentDate) {
  const currentDateObj = new Date(currentDate);
  const previousDate = new Date(currentDateObj);
  previousDate.setDate(previousDate.getDate() - 1);
  const previousDateString = previousDate.toISOString().split('T')[0];
  
  const previousDay = entries?.[year]?.days?.[previousDateString];
  if (!previousDay) {
    return { earnings: 0, availableBalance: 0 };
  }
  
  return {
    earnings: parseFloat(previousDay.earnings) || 0,
    availableBalance: parseFloat(previousDay.availableBalance) || 0
  };
}

/**
 * Gets the previous week's earnings and availableBalance for ticker calculation
 */
function getPreviousWeekData(entries, year, currentWeek) {
  const previousWeek = currentWeek === 1 ? 52 : currentWeek - 1;
  const previousYear = currentWeek === 1 ? year - 1 : year;
  
  const previousWeekData = entries?.[previousYear]?.weeks?.[previousWeek];
  if (!previousWeekData) {
    return { earnings: 0, availableBalance: 0 };
  }
  
  return {
    earnings: parseFloat(previousWeekData.earnings) || 0,
    availableBalance: parseFloat(previousWeekData.availableBalance) || 0
  };
}

/**
 * Calculates ticker value for a day entry
 */
function calculateDayTicker(entries, year, date, currentEarnings, currentAvailableBalance) {
  const previousData = getPreviousDayData(entries, year, date);
  const currentRatio = currentEarnings / (currentAvailableBalance || 1);
  const previousRatio = previousData.earnings / (previousData.availableBalance || 1);
  
  return calculatePercentageDelta(currentRatio, previousRatio);
}

/**
 * Calculates ticker value for a week entry
 */
function calculateWeekTicker(entries, year, week, currentEarnings, currentAvailableBalance) {
  const previousData = getPreviousWeekData(entries, year, week);
  const currentRatio = currentEarnings / (currentAvailableBalance || 1);
  const previousRatio = previousData.earnings / (previousData.availableBalance || 1);
  
  return calculatePercentageDelta(currentRatio, previousRatio);
}

/**
 * The main migration function.
 */
async function main() {
  logger('migration_start', 'Started ticker backfill migration');

  // 1. Fetch all documents from the 'users' collection.
  const documents = await prisma.user.findMany();
  logger('migration_documents_found', `Found ${documents.length} documents`);

  let updatedCount = 0;
  const updatePromises = [];

  // 2. Loop through each document to modify it in memory.
  for (const doc of documents) {
    const entries = doc.entries;
    if (!entries) {
      continue;
    }

    let wasModified = false;

    // 3. Process all years in entries
    for (const yearKey in entries) {
      if (Object.prototype.hasOwnProperty.call(entries, yearKey)) {
        const year = parseInt(yearKey);
        if (isNaN(year)) continue;

        const yearData = entries[year];
        if (!yearData) continue;

        // 4. Process days
        const days = yearData.days;
        if (days) {
          for (const dateKey in days) {
            if (Object.prototype.hasOwnProperty.call(days, dateKey)) {
              const dayData = days[dateKey];
              if (!dayData || dayData.ticker !== undefined) continue; // Skip if ticker already exists

              const currentEarnings = parseFloat(dayData.earnings) || 0;
              const currentAvailableBalance = parseFloat(dayData.availableBalance) || parseFloat(doc.availableBalance) || 0;
              
              const ticker = calculateDayTicker(entries, year, dateKey, currentEarnings, currentAvailableBalance);
              
              dayData.ticker = ticker;
              wasModified = true;
              logger('migration_day_ticker_calculated', `Day ${dateKey}: ${ticker.toFixed(2)}%`);
            }
          }
        }

        // 5. Process weeks
        const weeks = yearData.weeks;
        if (weeks) {
          for (const weekKey in weeks) {
            if (Object.prototype.hasOwnProperty.call(weeks, weekKey)) {
              const weekData = weeks[weekKey];
              if (!weekData || weekData.ticker !== undefined) continue; // Skip if ticker already exists

              const currentEarnings = parseFloat(weekData.earnings) || 0;
              const currentAvailableBalance = parseFloat(weekData.availableBalance) || parseFloat(doc.availableBalance) || 0;
              
              const ticker = calculateWeekTicker(entries, year, parseInt(weekKey), currentEarnings, currentAvailableBalance);
              
              weekData.ticker = ticker;
              wasModified = true;
              logger('migration_week_ticker_calculated', `Week ${weekKey}: ${ticker.toFixed(2)}%`);
            }
          }
        }
      }
    }

    // 6. If the document was changed, add its update operation to our list of promises.
    if (wasModified) {
      updatedCount++;
      const updatePromise = prisma.user.update({
        where: { id: doc.id },
        data: {
          entries: entries,
        },
      });
      updatePromises.push(updatePromise);
      logger('migration_document_update', `Document ${doc.id} updated with ticker values`);
    }
  }

  // 7. Execute all update promises in a single transaction.
  if (updatePromises.length > 0) {
    logger('migration_applying_updates', `Applying ${updatedCount} updates`);
    await prisma.$transaction(updatePromises);
    logger('migration_success', 'Ticker backfill completed successfully');
  } else {
    logger('migration_complete', 'No updates needed - all ticker values already exist');
  }
}

// 8. Execute the main function and handle potential errors.
main()
  .catch((e) => {
    logger('migration_failed', `Migration failed: ${e}`);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
