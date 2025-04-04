import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get current directory with ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Function to convert Excel data to JSON format
function convertExcelToJson() {
  try {
    // Read the Excel file
    const workbook = XLSX.readFile(path.join(__dirname, 'context.xlsx'));
    const sheetName = workbook.SheetNames[0];
    const rawData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
    
    console.log(`Loaded ${rawData.length} records from Excel file`);
    
    // Properly convert Excel date numbers to JavaScript Date objects
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
    
    // Transform the data to ensure proper date formatting
    const formattedData = rawData.map(row => {
      // Convert Excel dates if they exist
      let visitDate = row['Visit Plan: Visit Date'];
      let createdDate = row['Visit Report: Created Date'];
      
      // If dates are numbers (Excel format), convert them
      if (typeof visitDate === 'number') {
        visitDate = formatDate(excelDateToJSDate(visitDate));
      }
      
      if (typeof createdDate === 'number') {
        createdDate = formatDate(excelDateToJSDate(createdDate));
      }
      
      return {
        "visit_date": visitDate,
        "report_creation_date": createdDate,
        "salesperson_region": row['Visit Plan: Owner Region'],
        "salesperson_email": row['Visit Plan: Visit Owner Email'],
        "salesperson_name": row['Visit Plan: Owner Name'],
        "customer_name": row['Customer'],
        "customer_sap_code": row['Customer SAP Code'],
        "product_division": row['Visit Plan: Product Division'],
        "next_steps": row['Next Steps'],
        "outcome_of_the_meeting": row['Outcome of meeting']
      };
    });
    
    // Write the formatted data to a JSON file
    fs.writeFileSync(
      path.join(__dirname, 'context.json'),
      JSON.stringify(formattedData, null, 2)
    );
    
    // Also save to a different filename to ensure it's not a caching or file issue
    fs.writeFileSync(
      path.join(__dirname, 'data.json'),
      JSON.stringify(formattedData, null, 2)
    );
    
    console.log(`Successfully converted ${formattedData.length} records to JSON format`);
    console.log(`Saved to ${path.join(__dirname, 'context.json')} and ${path.join(__dirname, 'data.json')}`);
    
    // Display a sample of the first record
    if (formattedData.length > 0) {
      console.log('\nSample of first record:');
      console.log(JSON.stringify(formattedData[0], null, 2));
    }
    
    return formattedData;
  } catch (error) {
    console.error('Error converting Excel to JSON:', error);
    return [];
  }
}

// Execute the conversion
convertExcelToJson(); 