#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// File to update
const filePath = path.join(__dirname, 'add-weekly-translations.js');

try {
  let content = fs.readFileSync(filePath, 'utf8');

  // Replace all 'actions.weekly.' keys with just the action name
  content = content.replace(/'actions\.weekly\.([^']+)'/g, "'$1'");

  // Also replace any remaining 'actions.daily.' keys
  content = content.replace(/'actions\.daily\.([^']+)'/g, "'$1'");

  // Write back to file
  fs.writeFileSync(filePath, content);

  console.log('✅ Updated all translation keys from nested to flat structure');
  console.log('Changed: actions.weekly.* → *');
  console.log('Changed: actions.daily.* → *');

} catch (error) {
  console.error('❌ Error updating translation keys:', error.message);
}

