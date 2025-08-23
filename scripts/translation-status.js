const fs = require('fs');
const path = require('path');

// Read the English file as the reference
const enPath = path.join(__dirname, '../src/locales/en.json');
const enContent = JSON.parse(fs.readFileSync(enPath, 'utf8'));

// Get all language files
const localesDir = path.join(__dirname, '../src/locales');
const files = fs.readdirSync(localesDir).filter(file => file.endsWith('.json') && file !== 'en.json');

console.log('🌍 Translation Status Report\n');

// Function to find English text in translations
function findEnglishText(obj, path = '') {
  const englishTexts = [];
  
  for (const [key, value] of Object.entries(obj)) {
    const currentPath = path ? `${path}.${key}` : key;
    
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      englishTexts.push(...findEnglishText(value, currentPath));
    } else if (typeof value === 'string') {
      // Check if this looks like English text (simple heuristic)
      const isEnglish = /^[a-zA-Z\s.,!?;:'"()\-]+$/.test(value) && 
                       value.length > 3 && 
                       !value.includes('{') && 
                       !value.includes('}');
      
      if (isEnglish) {
        englishTexts.push({ path: currentPath, value });
      }
    }
  }
  
  return englishTexts;
}

// Process each file
let totalMissingKeys = 0;
let totalEnglishTexts = 0;
const summary = [];

files.forEach(file => {
  const filePath = path.join(localesDir, file);
  const locale = file.replace('.json', '');
  
  try {
    const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    // Check for missing keys
    const missingKeys = [];
    function checkKeys(target, source, path = '') {
      for (const key in source) {
        const currentPath = path ? `${path}.${key}` : key;
        
        if (!target.hasOwnProperty(key)) {
          missingKeys.push(currentPath);
        } else if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) {
          if (typeof target[key] === 'object' && target[key] !== null && !Array.isArray(target[key])) {
            checkKeys(target[key], source[key], currentPath);
          } else {
            missingKeys.push(currentPath);
          }
        }
      }
    }
    
    checkKeys(content, enContent);
    
    // Find English text
    const englishTexts = findEnglishText(content);
    
    totalMissingKeys += missingKeys.length;
    totalEnglishTexts += englishTexts.length;
    
    summary.push({
      locale,
      missingKeys: missingKeys.length,
      englishTexts: englishTexts.length,
      status: missingKeys.length === 0 ? '✅ Complete' : '❌ Incomplete'
    });
    
    console.log(`📁 ${locale.toUpperCase()}:`);
    
    if (missingKeys.length === 0) {
      console.log(`   ✅ All keys present`);
    } else {
      console.log(`   ❌ Missing ${missingKeys.length} keys`);
      missingKeys.slice(0, 5).forEach(key => console.log(`      - ${key}`));
      if (missingKeys.length > 5) {
        console.log(`      ... and ${missingKeys.length - 5} more`);
      }
    }
    
    if (englishTexts.length > 0) {
      console.log(`   ⚠️  ${englishTexts.length} English texts found`);
      englishTexts.slice(0, 3).forEach(({ path, value }) => {
        console.log(`      - ${path}: "${value}"`);
      });
      if (englishTexts.length > 3) {
        console.log(`      ... and ${englishTexts.length - 3} more`);
      }
    } else {
      console.log(`   ✅ No English text found`);
    }
    
    console.log('');
    
  } catch (error) {
    console.error(`❌ Error processing ${locale}:`, error.message);
  }
});

// Summary
console.log('📊 SUMMARY:');
console.log(`Total languages: ${files.length}`);
console.log(`Total missing keys: ${totalMissingKeys}`);
console.log(`Total English texts: ${totalEnglishTexts}`);
console.log(`Average English texts per language: ${Math.round(totalEnglishTexts / files.length)}`);

const completeLanguages = summary.filter(s => s.missingKeys === 0).length;
console.log(`Languages with all keys: ${completeLanguages}/${files.length} (${Math.round(completeLanguages/files.length*100)}%)`);

console.log('\n🎉 Translation status check complete!');
console.log('\nNote: English text in translations may be intentional for:');
console.log('- Placeholder text that needs translation');
console.log('- Technical terms that should remain in English');
console.log('- Brand names or proper nouns');
console.log('\nTo improve translations, consider:');
console.log('1. Translating the remaining English text');
console.log('2. Reviewing technical terms that should stay in English');
console.log('3. Adding context-specific translations'); 