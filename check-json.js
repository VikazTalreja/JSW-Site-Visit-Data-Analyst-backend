const fs = require('fs');
const path = require('path');

try {
  // Read the JSON file
  const jsonData = JSON.parse(fs.readFileSync(path.join(__dirname, 'context.json'), 'utf8'));
  
  // Display information about the data
  console.log(`Number of records: ${jsonData.length}`);
  console.log(`File exists: ${fs.existsSync(path.join(__dirname, 'context.json'))}`);
  console.log(`File size: ${fs.statSync(path.join(__dirname, 'context.json')).size} bytes`);
  
  // Display the first record as a sample
  if (jsonData.length > 0) {
    console.log('\nFirst record:');
    console.log(JSON.stringify(jsonData[0], null, 2));
  }
} catch (error) {
  console.error('Error reading JSON file:', error);
} 