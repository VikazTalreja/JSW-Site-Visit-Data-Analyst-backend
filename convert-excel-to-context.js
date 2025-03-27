const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

// Function to convert Excel data to the desired format
function convertExcelToContextJson() {
  try {
    // Read the Excel file
    const workbook = XLSX.readFile(path.join(__dirname, 'context.xlsx'));
    const sheetName = workbook.SheetNames[0];
    const rawData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
    
    console.log(`Loaded ${rawData.length} records from Excel file`);
    
    // Debug: Log the first row to see the column names
    if (rawData.length > 0) {
      console.log('First row column names:', Object.keys(rawData[0]));
    }
    
    // Transform the data into the desired format
    const formattedData = rawData.map((row, index) => {
      // Properly convert Excel date numbers to JavaScript Date objects
      // Excel dates are number of days since 1/1/1900 (with a small adjustment for a leap year error)
      const excelDateToJSDate = (excelDate) => {
        if (typeof excelDate === 'number') {
          // Excel date to JS Date (Excel starts at 1/1/1900, adjust for Excel's leap year bug)
          return new Date((excelDate - 25569) * 86400 * 1000);
        } else if (typeof excelDate === 'string') {
          return new Date(excelDate);
        } else {
          return new Date(); // Fallback to current date
        }
      };
      
      // Format dates as MM/DD/YY
      const formatDate = (date) => {
        return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear().toString().substr(-2)}`;
      };
      
      // Handle the dates using our conversion function
      const visitDate = excelDateToJSDate(row['Visit Plan: Visit Date']);
      const createdDate = excelDateToJSDate(row['Visit Report: Created Date']);
      
      // Keep all original data but ensure date formats
      return {
        "Visit Plan: Visit Date": formatDate(visitDate),
        "Visit Report: Created Date": formatDate(createdDate),
        "Visit Plan: Owner Region": row['Visit Plan: Owner Region'],
        "Visit Plan: Visit Owner Email": row['Visit Plan: Visit Owner Email'],
        "Visit Plan: Owner Name": row['Visit Plan: Owner Name'],
        "Customer": row['Customer'],
        "Customer SAP Code": row['Customer SAP Code'],
        "Visit Plan: Product Division": row['Visit Plan: Product Division'],
        "Next Steps": row['Next Steps'],
        "Outcome of meeting": row['Outcome of meeting']
      };
    });
    
    // Write the formatted data to context.json
    fs.writeFileSync(
      path.join(__dirname, 'context.json'),
      JSON.stringify(formattedData, null, 2)
    );
    
    console.log(`Successfully converted ${formattedData.length} records to LLM-friendly format`);
    console.log(`Saved to ${path.join(__dirname, 'context.json')}`);
    
    return formattedData;
  } catch (error) {
    console.error('Error converting Excel to context.json:', error);
    return [];
  }
}

// Run the conversion
const convertedData = convertExcelToContextJson();

// Display sample of the converted data
if (convertedData.length > 0) {
  console.log('\nSample of converted data format:');
  console.log(JSON.stringify(convertedData[0], null, 2));
} 