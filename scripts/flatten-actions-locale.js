#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Directory containing locale files
const localesDir = path.join(__dirname, '..', 'src', 'locales');

// Get all JSON files in the locales directory
const localeFiles = fs.readdirSync(localesDir)
  .filter(file => file.endsWith('.json'))
  .sort(); // Sort for consistent processing

console.log(`Found ${localeFiles.length} locale files: ${localeFiles.join(', ')}`);
console.log('\nProcessing files...\n');

localeFiles.forEach(file => {
  const filePath = path.join(localesDir, file);
  console.log(`Processing ${file}...`);

  try {
    // Read the locale file
    const content = fs.readFileSync(filePath, 'utf8');
    const localeData = JSON.parse(content);

    // Check if actions object exists and has daily/weekly structure
    if (localeData.actions && localeData.actions.daily && localeData.actions.weekly) {
      // Create new flattened actions object
      const flattenedActions = {};

      // Add all daily actions
      Object.keys(localeData.actions.daily).forEach(key => {
        flattenedActions[key] = localeData.actions.daily[key];
      });

      // Add all weekly actions
      Object.keys(localeData.actions.weekly).forEach(key => {
        flattenedActions[key] = localeData.actions.weekly[key];
      });

      // Replace the nested actions object with flattened version
      localeData.actions = flattenedActions;

      // Write the modified file back
      fs.writeFileSync(filePath, JSON.stringify(localeData, null, 2) + '\n');

      console.log(`  ✅ Flattened ${Object.keys(localeData.actions.daily).length} daily + ${Object.keys(localeData.actions.weekly).length} weekly actions into ${Object.keys(flattenedActions).length} total actions`);
    } else if (localeData.actions && !localeData.actions.daily && !localeData.actions.weekly) {
      // Already flattened structure
      const actionCount = Object.keys(localeData.actions).length;
      console.log(`  ✅ Already flattened with ${actionCount} actions`);
    } else {
      console.log(`  ⚠️  No actions structure found in ${file}`);
    }

  } catch (error) {
    console.error(`  ❌ Error processing ${file}: ${error.message}`);
  }
});

console.log('\nFlattening complete! 🎉');

// Summary of what was changed
console.log('\nSummary of changes:');
console.log('- actions.daily.* keys moved to actions.*');
console.log('- actions.weekly.* keys moved to actions.*');
console.log('- Original nested structure removed');
console.log('- All translations preserved');
console.log('\nNote: You may need to update any code that references the old nested structure (actions.daily.*, actions.weekly.*) to use the new flat structure (actions.*)');
