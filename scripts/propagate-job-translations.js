#!/usr/bin/env node

/**
 * Propagate job translations to all locale files
 * This script takes the job translations from en.json and adds them to all other locale files
 */

const fs = require('fs');
const path = require('path');

const LOCALES_DIR = path.join(__dirname, '../src/locales');
const SOURCE_LOCALE = 'en';

// Get the jobs section from en.json
const sourceFile = path.join(LOCALES_DIR, `${SOURCE_LOCALE}.json`);
const sourceData = JSON.parse(fs.readFileSync(sourceFile, 'utf8'));
const jobsTranslations = sourceData.jobs;

if (!jobsTranslations) {
  console.error('No jobs section found in en.json');
  process.exit(1);
}

console.log('Job translations from en.json:');
console.log(JSON.stringify(jobsTranslations, null, 2));

// Get all locale files
const localeFiles = fs.readdirSync(LOCALES_DIR)
  .filter(file => file.endsWith('.json'))
  .filter(file => file !== `${SOURCE_LOCALE}.json`);

console.log(`\nFound ${localeFiles.length} locale files to update\n`);

// Update each locale file
let updatedCount = 0;
localeFiles.forEach(file => {
  const filePath = path.join(LOCALES_DIR, file);
  const locale = file.replace('.json', '');
  
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    // Merge the jobs section (preserving any existing translations)
    data.jobs = {
      ...jobsTranslations,
      ...(data.jobs || {})
    };
    
    // Write back to file with proper formatting
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
    
    updatedCount++;
    console.log(`✓ Updated ${locale}.json`);
  } catch (error) {
    console.error(`✗ Error updating ${locale}.json:`, error.message);
  }
});

console.log(`\n✅ Successfully updated ${updatedCount} locale files`);
console.log(`ℹ️  Note: These are English translations. Please translate them to the appropriate languages.`);
