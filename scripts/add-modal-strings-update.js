const fs = require('fs');
const path = require('path');

// List of all locale files
const localeFiles = [
  'ar.json', 'bn.json', 'ca.json', 'cs.json', 'da.json', 'el.json', 'et.json', 
  'eu.json', 'fi.json', 'gl.json', 'ha.json', 'he.json', 'hi.json', 'hu.json', 
  'ja.json', 'ko.json', 'ms.json', 'nl.json', 'pa.json', 'pl.json', 'pt.json', 
  'ro.json', 'ru.json', 'sv.json', 'sw.json', 'tr.json', 'yo.json', 'zh.json'
];

// Additional modal strings to add
const additionalModalStrings = {
  "editingDay": "Editing {date}",
  "restore": "Restore"
};

// Function to add additional modal strings to a locale file
function addAdditionalModalStrings(fileName) {
  const filePath = path.join(__dirname, '..', 'src', 'locales', fileName);
  
  try {
    // Read the file
    const content = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(content);
    
    // Add additional modal strings if they don't exist
    if (data.modal && !data.modal.editingDay) {
      data.modal.editingDay = additionalModalStrings.editingDay;
      data.modal.restore = additionalModalStrings.restore;
      
      // Write back to file
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
      console.log(`✅ Added additional modal strings to ${fileName}`);
    } else if (data.modal && data.modal.editingDay) {
      console.log(`⚠️  Additional modal strings already exist in ${fileName}`);
    } else {
      console.log(`⚠️  No modal section found in ${fileName}`);
    }
  } catch (error) {
    console.error(`❌ Error processing ${fileName}:`, error.message);
  }
}

// Process all locale files
console.log('Adding additional modal strings to all locale files...\n');

localeFiles.forEach(fileName => {
  addAdditionalModalStrings(fileName);
});

console.log('\n✅ Additional modal strings addition completed!');
