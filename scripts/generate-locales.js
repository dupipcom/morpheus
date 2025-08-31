const fs = require('fs');
const path = require('path');

// List of all locales from constants.ts
const locales = ['ar', 'bn', 'ca', 'cs', 'da', 'de', 'el', 'en', 'es', 'et', 'eu', 'fi', 'fr', 'gl', 'ha', 'he', 'hi', 'hu', 'it', 'ja', 'ko', 'ms', 'nl', 'pa', 'pl', 'pt', 'ro', 'ru', 'sv', 'sw', 'tr', 'yo', 'zh'];

// Load the English template
const enTemplate = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/locales/en.json'), 'utf8'));

// Create locales directory if it doesn't exist
const localesDir = path.join(__dirname, '../src/locales');
if (!fs.existsSync(localesDir)) {
  fs.mkdirSync(localesDir, { recursive: true });
}

// Generate locale files
locales.forEach(locale => {
  const filePath = path.join(localesDir, `${locale}.json`);
  
  // Skip if file already exists
  if (fs.existsSync(filePath)) {
    console.log(`Skipping ${locale}.json - already exists`);
    return;
  }
  
  // For now, just copy the English template
  // In a real implementation, you would translate the strings
  fs.writeFileSync(filePath, JSON.stringify(enTemplate, null, 2));
  console.log(`Generated ${locale}.json`);
});

console.log('Locale generation complete!');
console.log('Note: All files currently contain English text. You should translate them manually or use a translation service.'); 